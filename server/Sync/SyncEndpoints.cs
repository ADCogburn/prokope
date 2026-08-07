using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using server.Data;
using server.Data.Entities;

namespace server.Sync;

// Implements #7's push/pull sync protocol against the schema from #6/#19.
// class/subject/lesson/student have no per-field CRDT columns -- concurrent
// edits to those from two devices are an accepted, out-of-scope edge case
// (see #7's "don't use 2 devices while disconnected" mitigation), so a push
// is a plain upsert-by-id for them. progress is the one table with real
// per-field HLC-based LWW-Register conflict resolution, since it's the only
// data teachers plausibly edit from two devices before ever syncing.
public static class SyncEndpoints
{
    public static void MapSyncEndpoints(this WebApplication app)
    {
        app.MapPost("/sync/push", async (
            SyncBatch request,
            ClaimsPrincipal principal,
            AppDbContext db,
            CancellationToken cancellationToken) =>
        {
            var userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var ownership = await LoadOwnershipAsync(db, userId.Value, cancellationToken);

            var classResults = new List<Class>();
            foreach (var row in request.Classes ?? [])
            {
                if (row.UserId != userId.Value)
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var entity = await db.Classes.FindAsync([row.Id], cancellationToken);
                if (entity is not null && entity.UserId != userId.Value)
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                if (entity is null)
                {
                    entity = new Class { Id = row.Id, UserId = row.UserId, Name = row.Name, CreatedAt = row.CreatedAt };
                    db.Classes.Add(entity);
                }

                entity.Name = row.Name;
                entity.DeletedAt = row.DeletedAt;
                entity.UpdatedAt = DateTimeOffset.UtcNow;
                ownership.ClassIds.Add(entity.Id);
                classResults.Add(entity);
            }

            var subjectResults = new List<Subject>();
            foreach (var row in request.Subjects ?? [])
            {
                if (!ownership.ClassIds.Contains(row.ClassId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var entity = await db.Subjects.FindAsync([row.Id], cancellationToken);
                if (entity is not null && !ownership.ClassIds.Contains(entity.ClassId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                if (entity is null)
                {
                    entity = new Subject { Id = row.Id, ClassId = row.ClassId, Name = row.Name, CreatedAt = row.CreatedAt };
                    db.Subjects.Add(entity);
                }

                entity.ClassId = row.ClassId;
                entity.Name = row.Name;
                entity.Position = row.Position;
                entity.DeletedAt = row.DeletedAt;
                entity.UpdatedAt = DateTimeOffset.UtcNow;
                ownership.SubjectIds.Add(entity.Id);
                subjectResults.Add(entity);
            }

            var studentResults = new List<Student>();
            foreach (var row in request.Students ?? [])
            {
                if (!ownership.ClassIds.Contains(row.ClassId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var entity = await db.Students.FindAsync([row.Id], cancellationToken);
                if (entity is not null && !ownership.ClassIds.Contains(entity.ClassId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                if (entity is null)
                {
                    entity = new Student { Id = row.Id, ClassId = row.ClassId, Name = row.Name, CreatedAt = row.CreatedAt };
                    db.Students.Add(entity);
                }

                entity.ClassId = row.ClassId;
                entity.Name = row.Name;
                entity.Position = row.Position;
                entity.DeletedAt = row.DeletedAt;
                entity.UpdatedAt = DateTimeOffset.UtcNow;
                ownership.StudentIds.Add(entity.Id);
                studentResults.Add(entity);
            }

            var lessonResults = new List<Lesson>();
            foreach (var row in request.Lessons ?? [])
            {
                if (!ownership.SubjectIds.Contains(row.SubjectId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var entity = await db.Lessons.FindAsync([row.Id], cancellationToken);
                if (entity is not null && !ownership.SubjectIds.Contains(entity.SubjectId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                if (entity is null)
                {
                    entity = new Lesson
                    {
                        Id = row.Id,
                        SubjectId = row.SubjectId,
                        Title = row.Title,
                        Description = row.Description,
                        CreatedAt = row.CreatedAt,
                    };
                    db.Lessons.Add(entity);
                }

                entity.SubjectId = row.SubjectId;
                entity.Unit = row.Unit;
                entity.LessonInUnit = row.LessonInUnit;
                entity.Title = row.Title;
                entity.Description = row.Description;
                entity.DeletedAt = row.DeletedAt;
                entity.UpdatedAt = DateTimeOffset.UtcNow;
                lessonResults.Add(entity);
            }

            // subject_template is keyed by user_id directly (per #165), not a
            // Class/Subject FK chain -- ownership is a direct comparison against
            // the caller, same shape as the class loop above.
            var subjectTemplateResults = new List<SubjectTemplate>();
            var ownedTemplateIds = ownership.SubjectTemplateIds;
            foreach (var row in request.SubjectTemplates ?? [])
            {
                if (row.UserId != userId.Value)
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var entity = await db.SubjectTemplates.FindAsync([row.Id], cancellationToken);
                if (entity is not null && entity.UserId != userId.Value)
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                if (entity is null)
                {
                    entity = new SubjectTemplate
                    {
                        Id = row.Id,
                        UserId = row.UserId,
                        Name = row.Name,
                        CreatedAt = row.CreatedAt,
                    };
                    db.SubjectTemplates.Add(entity);
                }

                entity.Name = row.Name;
                entity.UpdatedAt = DateTimeOffset.UtcNow;
                ownedTemplateIds.Add(entity.Id);
                subjectTemplateResults.Add(entity);
            }

            // subject_template_lesson's owning template may have just been
            // created earlier in this same push batch (mirrors how subject/
            // lesson handle a subject created in the same batch above) -- the
            // ownership set was seeded from existing rows and is extended with
            // every subject_template processed in this request.
            var subjectTemplateLessonResults = new List<SubjectTemplateLesson>();
            foreach (var row in request.SubjectTemplateLessons ?? [])
            {
                if (!ownedTemplateIds.Contains(row.SubjectTemplateId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var entity = await db.SubjectTemplateLessons.FindAsync([row.Id], cancellationToken);
                if (entity is not null && !ownedTemplateIds.Contains(entity.SubjectTemplateId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                if (entity is null)
                {
                    entity = new SubjectTemplateLesson
                    {
                        Id = row.Id,
                        SubjectTemplateId = row.SubjectTemplateId,
                        Title = row.Title,
                        Description = row.Description,
                        CreatedAt = row.CreatedAt,
                    };
                    db.SubjectTemplateLessons.Add(entity);
                }

                entity.SubjectTemplateId = row.SubjectTemplateId;
                entity.Unit = row.Unit;
                entity.LessonInUnit = row.LessonInUnit;
                entity.Title = row.Title;
                entity.Description = row.Description;
                entity.UpdatedAt = DateTimeOffset.UtcNow;
                subjectTemplateLessonResults.Add(entity);
            }

            // progress has no id-based identity of its own as far as merge is
            // concerned -- the (student_id, subject_id) pair is the cell's real
            // identity. Two devices that each created a row for the same cell
            // before ever syncing will have picked different ids; whichever one
            // reaches the server first establishes the canonical id, and later
            // pushes for that pair merge into it rather than creating a second
            // row (which the unique index on (student_id, subject_id) would
            // reject anyway).
            var progressResults = new List<Progress>();
            foreach (var row in request.Progress ?? [])
            {
                if (!ownership.StudentIds.Contains(row.StudentId) || !ownership.SubjectIds.Contains(row.SubjectId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var entity = await db.Progress.SingleOrDefaultAsync(
                    p => p.StudentId == row.StudentId && p.SubjectId == row.SubjectId, cancellationToken);

                if (entity is null)
                {
                    entity = new Progress
                    {
                        Id = row.Id,
                        StudentId = row.StudentId,
                        SubjectId = row.SubjectId,
                        StepUnit = row.StepUnit,
                        StepLessonInUnit = row.StepLessonInUnit,
                        StepHlc = row.StepHlc,
                        StepClientId = row.StepClientId,
                        Review = row.Review,
                        ReviewHlc = row.ReviewHlc,
                        ReviewClientId = row.ReviewClientId,
                        UpdatedAt = DateTimeOffset.UtcNow,
                    };
                    db.Progress.Add(entity);
                }
                else
                {
                    if (HlcWins(row.StepHlc, row.StepClientId, entity.StepHlc, entity.StepClientId))
                    {
                        entity.StepUnit = row.StepUnit;
                        entity.StepLessonInUnit = row.StepLessonInUnit;
                        entity.StepHlc = row.StepHlc;
                        entity.StepClientId = row.StepClientId;
                        entity.UpdatedAt = DateTimeOffset.UtcNow;
                    }

                    if (HlcWins(row.ReviewHlc, row.ReviewClientId, entity.ReviewHlc, entity.ReviewClientId))
                    {
                        entity.Review = row.Review;
                        entity.ReviewHlc = row.ReviewHlc;
                        entity.ReviewClientId = row.ReviewClientId;
                        entity.UpdatedAt = DateTimeOffset.UtcNow;
                    }
                }

                progressResults.Add(entity);
            }

            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(new SyncBatch(
                classResults.Select(ToSyncRow).ToList(),
                subjectResults.Select(ToSyncRow).ToList(),
                lessonResults.Select(ToSyncRow).ToList(),
                studentResults.Select(ToSyncRow).ToList(),
                progressResults.Select(ToSyncRow).ToList(),
                subjectTemplateResults.Select(ToSyncRow).ToList(),
                subjectTemplateLessonResults.Select(ToSyncRow).ToList()));
        })
        .WithName("SyncPush")
        .RequireAuthorization();

        app.MapGet("/sync/pull", async (
            string? since,
            ClaimsPrincipal principal,
            AppDbContext db,
            CancellationToken cancellationToken) =>
        {
            var userId = GetUserId(principal);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var watermarkFloor = DateTimeOffset.MinValue;
            if (!string.IsNullOrEmpty(since) &&
                DateTimeOffset.TryParse(since, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
            {
                watermarkFloor = parsed;
            }

            var ownership = await LoadOwnershipAsync(db, userId.Value, cancellationToken);

            var classes = await db.Classes
                .Where(c => c.UserId == userId.Value && c.UpdatedAt > watermarkFloor)
                .ToListAsync(cancellationToken);
            var subjects = await db.Subjects
                .Where(s => ownership.ClassIds.Contains(s.ClassId) && s.UpdatedAt > watermarkFloor)
                .ToListAsync(cancellationToken);
            var students = await db.Students
                .Where(st => ownership.ClassIds.Contains(st.ClassId) && st.UpdatedAt > watermarkFloor)
                .ToListAsync(cancellationToken);
            var lessons = await db.Lessons
                .Where(l => ownership.SubjectIds.Contains(l.SubjectId) && l.UpdatedAt > watermarkFloor)
                .ToListAsync(cancellationToken);
            var progress = await db.Progress
                .Where(p => ownership.StudentIds.Contains(p.StudentId)
                    && ownership.SubjectIds.Contains(p.SubjectId)
                    && p.UpdatedAt > watermarkFloor)
                .ToListAsync(cancellationToken);
            var subjectTemplates = await db.SubjectTemplates
                .Where(t => t.UserId == userId.Value && t.UpdatedAt > watermarkFloor)
                .ToListAsync(cancellationToken);
            var subjectTemplateLessons = await db.SubjectTemplateLessons
                .Where(tl => ownership.SubjectTemplateIds.Contains(tl.SubjectTemplateId) && tl.UpdatedAt > watermarkFloor)
                .ToListAsync(cancellationToken);

            var watermark = new[] { watermarkFloor }
                .Concat(classes.Select(c => c.UpdatedAt))
                .Concat(subjects.Select(s => s.UpdatedAt))
                .Concat(students.Select(st => st.UpdatedAt))
                .Concat(lessons.Select(l => l.UpdatedAt))
                .Concat(progress.Select(p => p.UpdatedAt))
                .Concat(subjectTemplates.Select(t => t.UpdatedAt))
                .Concat(subjectTemplateLessons.Select(tl => tl.UpdatedAt))
                .Max();

            return Results.Ok(new SyncPullResponse(
                classes.Select(ToSyncRow).ToList(),
                subjects.Select(ToSyncRow).ToList(),
                lessons.Select(ToSyncRow).ToList(),
                students.Select(ToSyncRow).ToList(),
                progress.Select(ToSyncRow).ToList(),
                subjectTemplates.Select(ToSyncRow).ToList(),
                subjectTemplateLessons.Select(ToSyncRow).ToList(),
                watermark));
        })
        .WithName("SyncPull")
        .RequireAuthorization();
    }

    private static Guid? GetUserId(ClaimsPrincipal principal)
    {
        var subject = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return subject is not null && Guid.TryParse(subject, out var userId) ? userId : null;
    }

    // Ownership is anchored at class.user_id; subject/lesson/student/progress
    // have no user_id of their own, so membership is derived by walking their
    // FK chain up to a class the user owns. Deliberately not filtered by
    // deleted_at: a soft-deleted class is still this user's class, and a
    // device that was offline when it was deleted still needs to be told so.
    private static async Task<OwnershipSets> LoadOwnershipAsync(
        AppDbContext db, Guid userId, CancellationToken cancellationToken)
    {
        var classIds = (await db.Classes
            .Where(c => c.UserId == userId)
            .Select(c => c.Id)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        var subjectIds = (await db.Subjects
            .Where(s => classIds.Contains(s.ClassId))
            .Select(s => s.Id)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        var studentIds = (await db.Students
            .Where(st => classIds.Contains(st.ClassId))
            .Select(st => st.Id)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        // subject_template is keyed by user_id directly (per #165), not
        // walked via a Class/Subject FK chain like the sets above.
        var subjectTemplateIds = (await db.SubjectTemplates
            .Where(t => t.UserId == userId)
            .Select(t => t.Id)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        return new OwnershipSets(classIds, subjectIds, studentIds, subjectTemplateIds);
    }

    // Same "does the challenger's HLC beat the incumbent's" rule the client
    // sync engine applies (src/sync/mergeProgress.ts) -- kept in sync by hand
    // since the two run in different languages, but both compare the padded,
    // lexicographically-sortable HLC string first and fall back to client_id
    // only on an exact tie, so two devices racing on the same field always
    // resolve to the same winner regardless of which side merges it.
    private static bool HlcWins(string challengerHlc, Guid challengerClientId, string incumbentHlc, Guid incumbentClientId)
    {
        if (challengerHlc != incumbentHlc)
        {
            return string.CompareOrdinal(challengerHlc, incumbentHlc) > 0;
        }

        return string.CompareOrdinal(challengerClientId.ToString(), incumbentClientId.ToString()) > 0;
    }

    private static ClassSyncRow ToSyncRow(Class entity) =>
        new(entity.Id, entity.UserId, entity.Name, entity.CreatedAt, entity.UpdatedAt, entity.DeletedAt);

    private static SubjectSyncRow ToSyncRow(Subject entity) =>
        new(entity.Id, entity.ClassId, entity.Name, entity.Position, entity.CreatedAt, entity.UpdatedAt, entity.DeletedAt);

    private static LessonSyncRow ToSyncRow(Lesson entity) =>
        new(entity.Id, entity.SubjectId, entity.Unit, entity.LessonInUnit, entity.Title, entity.Description,
            entity.CreatedAt, entity.UpdatedAt, entity.DeletedAt);

    private static StudentSyncRow ToSyncRow(Student entity) =>
        new(entity.Id, entity.ClassId, entity.Name, entity.Position, entity.CreatedAt, entity.UpdatedAt, entity.DeletedAt);

    private static ProgressSyncRow ToSyncRow(Progress entity) =>
        new(entity.Id, entity.StudentId, entity.SubjectId, entity.StepUnit, entity.StepLessonInUnit,
            entity.StepHlc, entity.StepClientId, entity.Review, entity.ReviewHlc, entity.ReviewClientId, entity.UpdatedAt);

    private static SubjectTemplateSyncRow ToSyncRow(SubjectTemplate entity) =>
        new(entity.Id, entity.UserId, entity.Name, entity.CreatedAt, entity.UpdatedAt);

    private static SubjectTemplateLessonSyncRow ToSyncRow(SubjectTemplateLesson entity) =>
        new(entity.Id, entity.SubjectTemplateId, entity.Unit, entity.LessonInUnit, entity.Title, entity.Description,
            entity.CreatedAt, entity.UpdatedAt);

    private sealed record OwnershipSets(
        HashSet<Guid> ClassIds, HashSet<Guid> SubjectIds, HashSet<Guid> StudentIds, HashSet<Guid> SubjectTemplateIds);
}
