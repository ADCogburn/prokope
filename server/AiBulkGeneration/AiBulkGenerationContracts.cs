using System.Text.Json.Serialization;

namespace server.AiBulkGeneration;

// The generated lesson list's wire shape deliberately mirrors LessonSyncRow
// (see server/Sync/SyncContracts.cs: unit, lesson_in_unit, title,
// description) rather than the app's usual camelCase JSON convention (see
// AuthContracts.cs) -- so a future client can review a proposed lesson and
// hand it straight to the same sync/Dexie row shape without translating
// between two vocabularies, per #192.

public record AiBulkGenerationRequest(
    [property: JsonPropertyName("curriculum_name")] string CurriculumName);

public record GeneratedLessonDto(
    [property: JsonPropertyName("unit")] int Unit,
    [property: JsonPropertyName("lesson_in_unit")] int LessonInUnit,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description);

// 200 OK body for the Generated outcome.
public record AiBulkGenerationResponse(
    [property: JsonPropertyName("lessons")] List<GeneratedLessonDto> Lessons);

// 404 body for the NotFound outcome -- distinct shape from
// AiBulkGenerationResponse so a client can tell the two apart even if it
// only inspects the body, not just the status code.
public record AiBulkGenerationNotFoundResponse(
    [property: JsonPropertyName("curriculum_name")] string CurriculumName,
    [property: JsonPropertyName("message")] string Message);
