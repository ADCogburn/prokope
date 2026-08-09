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

    // #221: token usage actually spent reaching this outcome, for the
    // endpoint's cost-visibility log. Optional (rather than required) so the
    // NotFound/Failed/TimedOut singletons below stay usable exactly as they
    // already are everywhere -- StubAnthropicCurriculumClient included, per
    // #221's "existing test cases pass unmodified" acceptance criterion --
    // with the real client attaching usage via a `with` expression instead.
    public TokenUsage? TokenUsage { get; init; }

    public static CurriculumGenerationResult NotFound { get; } = new() { Status = CurriculumGenerationStatus.NotFound };

    public static CurriculumGenerationResult Failed { get; } = new() { Status = CurriculumGenerationStatus.Failed };

    public static CurriculumGenerationResult TimedOut { get; } = new() { Status = CurriculumGenerationStatus.TimedOut };

    public static CurriculumGenerationResult Generated(IReadOnlyList<GeneratedLesson> lessons, TokenUsage? tokenUsage = null) =>
        new() { Status = CurriculumGenerationStatus.Generated, Lessons = lessons, TokenUsage = tokenUsage };
}

// Domain-level shape of one generated lesson -- deliberately separate from
// the endpoint's wire DTO (see AiBulkGenerationContracts.cs) so this
// interface doesn't carry any HTTP/JSON concerns. Variable count per unit,
// per #192's spec.
public record GeneratedLesson(int Unit, int LessonInUnit, string Title, string Description);

// #221: domain-level token usage for one generation attempt, summed across
// however many real Anthropic calls it actually made (search + gather, plus
// one or two extract + constrain attempts). Deliberately separate from the
// Anthropic SDK's own Usage type, same rationale as GeneratedLesson above.
public sealed record TokenUsage(long InputTokens, long OutputTokens)
{
    public static TokenUsage operator +(TokenUsage a, TokenUsage b) =>
        new(a.InputTokens + b.InputTokens, a.OutputTokens + b.OutputTokens);
}
