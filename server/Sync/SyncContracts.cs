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

public record ProgressSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("student_id")] Guid StudentId,
    [property: JsonPropertyName("subject_id")] Guid SubjectId,
    [property: JsonPropertyName("step_unit")] int StepUnit,
    [property: JsonPropertyName("step_lesson_in_unit")] int StepLessonInUnit,
    [property: JsonPropertyName("step_hlc")] string StepHlc,
    [property: JsonPropertyName("step_client_id")] Guid StepClientId,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

// #152/ADR-0011: replaces Progress.Review/ReviewHlc/ReviewClientId with a
// standalone per-(student, lesson) flag, same single-field HLC+client-id
// LWW-register shape as Progress.Step*.
public record ReviewFlagSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("student_id")] Guid StudentId,
    [property: JsonPropertyName("lesson_id")] Guid LessonId,
    [property: JsonPropertyName("flagged")] bool Flagged,
    [property: JsonPropertyName("hlc")] string Hlc,
    [property: JsonPropertyName("client_id")] Guid ClientId,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

// #168: class_template rows are keyed by user_id directly (not class_id),
// and -- like class_template_subject/class_template_lesson below -- have no
// deleted_at: they're immutable and create-only, so unlike the rows above
// there's no soft-delete field to carry over the wire.
public record ClassTemplateSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("user_id")] Guid UserId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public record ClassTemplateSubjectSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("class_template_id")] Guid ClassTemplateId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("position")] int Position,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public record ClassTemplateLessonSyncRow(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("class_template_subject_id")] Guid ClassTemplateSubjectId,
    [property: JsonPropertyName("unit")] int Unit,
    [property: JsonPropertyName("lesson_in_unit")] int LessonInUnit,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt);

public record SyncBatch(
    [property: JsonPropertyName("classes")] List<ClassSyncRow> Classes,
    [property: JsonPropertyName("subjects")] List<SubjectSyncRow> Subjects,
    [property: JsonPropertyName("lessons")] List<LessonSyncRow> Lessons,
    [property: JsonPropertyName("students")] List<StudentSyncRow> Students,
    [property: JsonPropertyName("progress")] List<ProgressSyncRow> Progress,
    [property: JsonPropertyName("review_flags")] List<ReviewFlagSyncRow> ReviewFlags,
    [property: JsonPropertyName("class_templates")] List<ClassTemplateSyncRow> ClassTemplates,
    [property: JsonPropertyName("class_template_subjects")] List<ClassTemplateSubjectSyncRow> ClassTemplateSubjects,
    [property: JsonPropertyName("class_template_lessons")] List<ClassTemplateLessonSyncRow> ClassTemplateLessons);

public record SyncPullResponse(
    [property: JsonPropertyName("classes")] List<ClassSyncRow> Classes,
    [property: JsonPropertyName("subjects")] List<SubjectSyncRow> Subjects,
    [property: JsonPropertyName("lessons")] List<LessonSyncRow> Lessons,
    [property: JsonPropertyName("students")] List<StudentSyncRow> Students,
    [property: JsonPropertyName("progress")] List<ProgressSyncRow> Progress,
    [property: JsonPropertyName("review_flags")] List<ReviewFlagSyncRow> ReviewFlags,
    [property: JsonPropertyName("class_templates")] List<ClassTemplateSyncRow> ClassTemplates,
    [property: JsonPropertyName("class_template_subjects")] List<ClassTemplateSubjectSyncRow> ClassTemplateSubjects,
    [property: JsonPropertyName("class_template_lessons")] List<ClassTemplateLessonSyncRow> ClassTemplateLessons,
    [property: JsonPropertyName("watermark")] DateTimeOffset Watermark);
