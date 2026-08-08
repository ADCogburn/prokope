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
                ownership.LessonIds.Add(entity.Id);
                lessonResults.Add(entity);
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
                }

                progressResults.Add(entity);
            }

            // #152/ADR-0011: review_flag is keyed by (student_id, lesson_id)
            // rather than (student_id, subject_id) -- same canonical-id
            // reconciliation rationale as progress above, just against a
            // different pair and a different unique index.
            var reviewFlagResults = new List<ReviewFlag>();
            foreach (var row in request.ReviewFlags ?? [])
            {
                if (!ownership.StudentIds.Contains(row.StudentId) || !ownership.LessonIds.Contains(row.LessonId))
                {
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                }

                var entity = await db.ReviewFlags.SingleOrDefaultAsync(
                    r => r.StudentId == row.StudentId && r.LessonId == row.LessonId, cancellationToken);

                if (entity is null)
                {
                    entity = new ReviewFlag
                    {
                        Id = row.Id,
                        StudentId = row.StudentId,
                        LessonId = row.LessonId,
                        Flagged = row.Flagged,
                        Hlc = row.Hlc,
                        ClientId = row.ClientId,
                        UpdatedAt = DateTimeOffset.UtcNow,
                    };
                    db.ReviewFlags.Add(entity);
                }
                else if (HlcWins(row.Hlc, row.ClientId, entity.Hlc, entity.ClientId))
                {
                    entity.Flagged = row.Flagged;
                    entity.Hlc = row.Hlc;
                    entity.ClientId = row.ClientId;
                    entity.UpdatedAt = DateTimeOffset.UtcNow;
                }

                reviewFlagResults.Add(entity);
            }

            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(new SyncBatch(
                classResults.Select(ToSyncRow).ToList(),
                subjectResults.Select(ToSyncRow).ToList(),
                lessonResults.Select(ToSyncRow).ToList(),
                studentResults.Select(ToSyncRow).ToList(),
                progressResults.Select(ToSyncRow).ToList(),
                reviewFlagResults.Select(ToSyncRow).ToList()));
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
            var reviewFlags = await db.ReviewFlags
                .Where(r => ownership.StudentIds.Contains(r.StudentId)
                    && ownership.LessonIds.Contains(r.LessonId)
                    && r.UpdatedAt > watermarkFloor)
                .ToListAsync(cancellationToken);

            var watermark = new[] { watermarkFloor }
                .Concat(classes.Select(c => c.UpdatedAt))
                .Concat(subjects.Select(s => s.UpdatedAt))
                .Concat(students.Select(st => st.UpdatedAt))
                .Concat(lessons.Select(l => l.UpdatedAt))
                .Concat(progress.Select(p => p.UpdatedAt))
                .Concat(reviewFlags.Select(r => r.UpdatedAt))
                .Max();

            return Results.Ok(new SyncPullResponse(
                classes.Select(ToSyncRow).ToList(),
                subjects.Select(ToSyncRow).ToList(),
                lessons.Select(ToSyncRow).ToList(),
                students.Select(ToSyncRow).ToList(),
                progress.Select(ToSyncRow).ToList(),
                reviewFlags.Select(ToSyncRow).ToList(),
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

        var lessonIds = (await db.Lessons
            .Where(l => subjectIds.Contains(l.SubjectId))
            .Select(l => l.Id)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        return new OwnershipSets(classIds, subjectIds, studentIds, lessonIds);
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
            entity.StepHlc, entity.StepClientId, entity.UpdatedAt);

    private static ReviewFlagSyncRow ToSyncRow(ReviewFlag entity) =>
        new(entity.Id, entity.StudentId, entity.LessonId, entity.Flagged, entity.Hlc, entity.ClientId, entity.UpdatedAt);

    private sealed record OwnershipSets(
        HashSet<Guid> ClassIds, HashSet<Guid> SubjectIds, HashSet<Guid> StudentIds, HashSet<Guid> LessonIds);
}
