using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using server.AiBulkGeneration;
using server.Auth;

namespace server.Tests;

// Regression coverage for #218: introducing a second, timeout-triggered
// cancellation source inside AnthropicCurriculumClient must not disturb the
// existing behavior where a teacher navigating away or closing the tab
// mid-request cancels the in-flight generation call. Uses
// CancellationProbeDatabaseFixture (a singleton
// CancellationProbeAnthropicCurriculumClient) so the test can observe, from
// outside the HTTP request, whether the generation call's own
// CancellationToken actually fired.
public class AiBulkGenerationCancellationTests(CancellationProbeDatabaseFixture fixture)
    : IClassFixture<CancellationProbeDatabaseFixture>
{
    [Fact]
    public async Task Cancelling_the_request_mid_flight_still_cancels_the_in_flight_generation_call()
    {
        using var client = await AuthenticatedClientAsync();
        var probe = (CancellationProbeAnthropicCurriculumClient)fixture.Services.GetRequiredService<IAnthropicCurriculumClient>();

        using var requestCts = new CancellationTokenSource();
        var requestTask = client.PostAsJsonAsync(
            "/ai-bulk-generation",
            new AiBulkGenerationRequest("Any curriculum"),
            requestCts.Token);

        // Waits for the generation call to actually start (rather than a
        // fixed delay) so the test can't flake by cancelling too early.
        await probe.Started.WaitAsync(TimeSpan.FromSeconds(10));
        requestCts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => requestTask);

        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!probe.WasCancelled && DateTime.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(25));
        }

        Assert.True(probe.WasCancelled);
    }

    private async Task<HttpClient> AuthenticatedClientAsync()
    {
        var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims(
            $"sub-ai-bulk-generation-cancellation-{Guid.NewGuid()}",
            "ai-bulk-generation-cancellation@example.com",
            emailVerified: true);

        var login = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));
        var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Token);
        return client;
    }
}
