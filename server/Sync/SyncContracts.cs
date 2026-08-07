using System.Text.Json.Serialization;

namespace server.Sync;

// Wire shape deliberately mirrors the client's Dexie row field names
// (snake_case, matching the Postgres columns) rather than the app's usual
// camelCase JSON convention (see AuthContracts.cs) -- so #20's client sync
// engine can push/apply these rows near-verbatim against src/db/schema.ts's
// row types instead of translating between two vocabularies, per #19.

public record ClassSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("user_id")] Guid UserId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt,
    [property: JsonPropertyName("deleted_at")] DateTimeOffset? DeletedAt);

public record SubjectSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("class_id")] Guid ClassId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("position")] int Position,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt,
    [property: JsonPropertyName("deleted_at")] DateTimeOffset? DeletedAt);

public record LessonSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("subject_id")] Guid SubjectId,
    [property: JsonPropertyName("unit")] int Unit,
    [property: JsonPropertyName("lesson_in_unit")] int LessonInUnit,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt,
    [property: JsonPropertyName("deleted_at")] DateTimeOffset? DeletedAt);

public record StudentSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("class_id")] Guid ClassId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("position")] int Position,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt,
    [property: JsonPropertyName("deleted_at")] DateTimeOffset? DeletedAt);

// #165: keyed by user_id directly (not class_id/subject_id), so a Template
// outlives its source Subject/Class. No deleted_at -- Templates are
// immutable/create-only per #147, there is no soft-delete path.
public record SubjectTemplateSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("user_id")] Guid UserId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public record SubjectTemplateLessonSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("subject_template_id")] Guid SubjectTemplateId,
    [property: JsonPropertyName("unit")] int Unit,
    [property: JsonPropertyName("lesson_in_unit")] int LessonInUnit,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public record ProgressSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("student_id")] Guid StudentId,
    [property: JsonPropertyName("subject_id")] Guid SubjectId,
    [property: JsonPropertyName("step_unit")] int StepUnit,
    [property: JsonPropertyName("step_lesson_in_unit")] int StepLessonInUnit,
    [property: JsonPropertyName("step_hlc")] string StepHlc,
    [property: JsonPropertyName("step_client_id")] Guid StepClientId,
    [property: JsonPropertyName("review")] bool Review,
    [property: JsonPropertyName("review_hlc")] string ReviewHlc,
    [property: JsonPropertyName("review_client_id")] Guid ReviewClientId,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public record SyncBatch(
    [property: JsonPropertyName("classes")] List<ClassSyncRow> Classes,
    [property: JsonPropertyName("subjects")] List<SubjectSyncRow> Subjects,
    [property: JsonPropertyName("lessons")] List<LessonSyncRow> Lessons,
    [property: JsonPropertyName("students")] List<StudentSyncRow> Students,
    [property: JsonPropertyName("progress")] List<ProgressSyncRow> Progress,
    [property: JsonPropertyName("subject_templates")] List<SubjectTemplateSyncRow> SubjectTemplates,
    [property: JsonPropertyName("subject_template_lessons")] List<SubjectTemplateLessonSyncRow> SubjectTemplateLessons);

public record SyncPullResponse(
    [property: JsonPropertyName("classes")] List<ClassSyncRow> Classes,
    [property: JsonPropertyName("subjects")] List<SubjectSyncRow> Subjects,
    [property: JsonPropertyName("lessons")] List<LessonSyncRow> Lessons,
    [property: JsonPropertyName("students")] List<StudentSyncRow> Students,
    [property: JsonPropertyName("progress")] List<ProgressSyncRow> Progress,
    [property: JsonPropertyName("subject_templates")] List<SubjectTemplateSyncRow> SubjectTemplates,
    [property: JsonPropertyName("subject_template_lessons")] List<SubjectTemplateLessonSyncRow> SubjectTemplateLessons,
    [property: JsonPropertyName("watermark")] DateTimeOffset Watermark);
