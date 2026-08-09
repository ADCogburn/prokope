namespace server.AiBulkGeneration;

// Wraps the real implementation's two-call Anthropic web-search interaction
// (search + gather, then extract + constrain -- see ADR-0018) behind a
// single method, mirroring IGoogleTokenVerifier: callers never know there's
// more than one call, or a retry, happening underneath. Kept behind this
// interface (rather than calling the Anthropic SDK inline) so tests can
// swap in a stub that returns a canned outcome without a network call to
// Anthropic.
public interface IAnthropicCurriculumClient
{
    Task<CurriculumGenerationResult> GenerateAsync(string curriculumName, CancellationToken cancellationToken = default);
}

// The outcomes a curriculum-generation attempt can produce: a successfully
// generated lesson list, a distinct "couldn't find this curriculum" result,
// a generic hard failure, or (#218) a call that exceeded its explicit
// per-call deadline. Kept distinct so a future client can tell "we don't
// have this curriculum" apart from "something broke" (#192's user story
// #2/#15), and TimedOut apart from Failed so the endpoint can surface a
// specific 504 rather than the generic 502.
public enum CurriculumGenerationStatus
{
    Generated,
    NotFound,
    Failed,
    TimedOut,
}

public record CurriculumGenerationResult
{
    public required CurriculumGenerationStatus Status { get; init; }
    public IReadOnlyList<GeneratedLesson>? Lessons { get; init; }

    public static CurriculumGenerationResult NotFound { get; } = new() { Status = CurriculumGenerationStatus.NotFound };

    public static CurriculumGenerationResult Failed { get; } = new() { Status = CurriculumGenerationStatus.Failed };

    public static CurriculumGenerationResult TimedOut { get; } = new() { Status = CurriculumGenerationStatus.TimedOut };

    public static CurriculumGenerationResult Generated(IReadOnlyList<GeneratedLesson> lessons) =>
        new() { Status = CurriculumGenerationStatus.Generated, Lessons = lessons };
}

// Domain-level shape of one generated lesson -- deliberately separate from
// the endpoint's wire DTO (see AiBulkGenerationContracts.cs) so this
// interface doesn't carry any HTTP/JSON concerns. Variable count per unit,
// per #192's spec.
public record GeneratedLesson(int Unit, int LessonInUnit, string Title, string Description);
