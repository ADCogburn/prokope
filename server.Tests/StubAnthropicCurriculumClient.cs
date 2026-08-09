using server.AiBulkGeneration;

namespace server.Tests;

// Test double for IAnthropicCurriculumClient: the desired outcome is
// encoded directly in the curriculum name, so tests can drive all three
// outcomes (generated list, not-found, failed) through the real
// POST /ai-bulk-generation endpoint without ever calling Anthropic's
// network. Mirrors StubGoogleTokenVerifier's shape.
public class StubAnthropicCurriculumClient : IAnthropicCurriculumClient
{
    private const string GeneratedPrefix = "stub-generated:";
    private const string NotFoundPrefix = "stub-not-found:";
    private const string FailedPrefix = "stub-failed:";

    // Encodes a small, fixed lesson list; individual tests only need to
    // assert generation succeeded, not control specific lesson content.
    public static string Generated(string curriculumName) => $"{GeneratedPrefix}{curriculumName}";

    public static string NotFound(string curriculumName) => $"{NotFoundPrefix}{curriculumName}";

    public static string Failed(string curriculumName) => $"{FailedPrefix}{curriculumName}";

    public Task<CurriculumGenerationResult> GenerateAsync(string curriculumName, CancellationToken cancellationToken = default)
    {
        if (curriculumName.StartsWith(GeneratedPrefix, StringComparison.Ordinal))
        {
            var name = curriculumName[GeneratedPrefix.Length..];
            IReadOnlyList<GeneratedLesson> lessons =
            [
                new GeneratedLesson(Unit: 1, LessonInUnit: 1, Title: $"Intro to {name}", Description: "Overview lesson."),
                new GeneratedLesson(Unit: 1, LessonInUnit: 2, Title: $"{name} Fundamentals", Description: "Core concepts."),
                new GeneratedLesson(Unit: 2, LessonInUnit: 1, Title: $"Advanced {name}", Description: "Deeper dive."),
            ];
            return Task.FromResult(CurriculumGenerationResult.Generated(lessons));
        }

        if (curriculumName.StartsWith(NotFoundPrefix, StringComparison.Ordinal))
        {
            return Task.FromResult(CurriculumGenerationResult.NotFound);
        }

        // Any other input -- including the FailedPrefix case and anything
        // not encoded at all -- simulates a generic hard failure.
        return Task.FromResult(CurriculumGenerationResult.Failed);
    }
}
