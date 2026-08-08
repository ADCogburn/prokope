namespace server.AiBulkGeneration;

// Placeholder registration only, so the app has *something* to resolve
// IAnthropicCurriculumClient with and can boot (#197). The real
// Anthropic-backed two-call implementation (ADR-0018: search + gather, then
// extract + constrain, with a one-time retry on schema-validation failure)
// is a later, separate ticket. Nothing calls POST /ai-bulk-generation from a
// real client yet, and every test substitutes StubAnthropicCurriculumClient
// into DI instead of this type (see DatabaseFixture), so this placeholder's
// behavior is never actually exercised -- it only needs to exist and
// satisfy the interface.
public class AnthropicCurriculumClient : IAnthropicCurriculumClient
{
    public Task<CurriculumGenerationResult> GenerateAsync(string curriculumName, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException(
            "AnthropicCurriculumClient is a placeholder registration (#197); the real Anthropic-backed implementation lands in a later ticket.");
}
