using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using server.AiBulkGeneration;
using server.Auth;

namespace server.Tests;

// #214: the per-teacher daily rate limit (ADR-0020). Uses
// SmallDailyLimitDatabaseFixture (cap of 3, see DatabaseFixture.cs) rather
// than the real default of 20, so exhausting the cap doesn't require 20 HTTP
// round-trips per test -- also doubles as proof the cap is read from
// configuration rather than hardcoded, since it trips at request 4 here
// instead of request 21.
public class AiBulkGenerationRateLimitTests(SmallDailyLimitDatabaseFixture fixture)
    : IClassFixture<SmallDailyLimitDatabaseFixture>
{
    private const int DailyLimit = 3;

    [Fact]
    public async Task Teacher_at_the_daily_cap_receives_429_with_a_daily_specific_message()
    {
        using var client = await AuthenticatedClientAsync();
        await ExhaustDailyLimitAsync(client);

        var response = await client.PostAsJsonAsync(
            "/ai-bulk-generation",
            new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated("One too many")));

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(body);
        Assert.Contains($"all {DailyLimit} AI generations for today", body!.Detail);
    }

    [Fact]
    public async Task Blocked_request_never_reaches_the_curriculum_client()
    {
        using var client = await AuthenticatedClientAsync();
        await ExhaustDailyLimitAsync(client);

        // Encoded as a curriculum the stub would generate successfully (200)
        // if the request ever reached it -- the endpoint's switch statement
        // never produces 429 on its own, so a 429 here is only possible if
        // the rate-limit check short-circuited before GenerateAsync ran.
        var response = await client.PostAsJsonAsync(
            "/ai-bulk-generation",
            new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated("Would have generated")));

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }

    [Fact]
    public async Task A_different_teacher_is_unaffected_by_another_teachers_daily_cap()
    {
        using var teacherA = await AuthenticatedClientAsync();
        using var teacherB = await AuthenticatedClientAsync();

        await ExhaustDailyLimitAsync(teacherA);
        var blockedForA = await teacherA.PostAsJsonAsync(
            "/ai-bulk-generation",
            new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated("Blocked")));
        Assert.Equal(HttpStatusCode.TooManyRequests, blockedForA.StatusCode);

        var responseForB = await teacherB.PostAsJsonAsync(
            "/ai-bulk-generation",
            new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated("Still allowed")));

        Assert.Equal(HttpStatusCode.OK, responseForB.StatusCode);
    }

    private static async Task ExhaustDailyLimitAsync(HttpClient client)
    {
        for (var i = 0; i < DailyLimit; i++)
        {
            var response = await client.PostAsJsonAsync(
                "/ai-bulk-generation",
                new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated($"Subject {i}")));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
    }

    // Same pattern as AiBulkGenerationEndpointsTests -- logs in via the stub
    // Google verifier to obtain a real bearer token for a brand-new teacher,
    // so each test's daily count starts at zero regardless of what other
    // tests in this class already ran.
    private async Task<HttpClient> AuthenticatedClientAsync()
    {
        var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims(
            $"sub-ai-bulk-generation-rate-limit-{Guid.NewGuid()}",
            "ai-bulk-generation-rate-limit@example.com",
            emailVerified: true);

        var login = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));
        var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Token);
        return client;
    }
}
