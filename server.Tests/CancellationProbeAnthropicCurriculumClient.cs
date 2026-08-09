using server.AiBulkGeneration;

namespace server.Tests;

// Test double for AiBulkGenerationCancellationTests (#218): rather than
// returning immediately like StubAnthropicCurriculumClient, this blocks on
// the CancellationToken it receives and records whether that token was ever
// actually cancelled -- letting a test prove the endpoint's request-scoped
// cancellation still reaches the generation call after #218 introduced a
// second, timeout-triggered cancellation source alongside it.
public class CancellationProbeAnthropicCurriculumClient : IAnthropicCurriculumClient
{
    private readonly TaskCompletionSource _started = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public Task Started => _started.Task;

    public bool WasCancelled { get; private set; }

    public async Task<CurriculumGenerationResult> GenerateAsync(string curriculumName, CancellationToken cancellationToken = default)
    {
        _started.TrySetResult();

        try
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            WasCancelled = true;
            throw;
        }

        // Unreachable: Task.Delay(Timeout.Infinite, ...) only ever
        // completes by throwing once cancellationToken fires.
        return CurriculumGenerationResult.Failed;
    }
}
