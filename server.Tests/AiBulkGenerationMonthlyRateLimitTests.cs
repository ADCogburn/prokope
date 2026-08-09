using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using server.AiBulkGeneration;
using server.Auth;
using server.Data;

namespace server.Tests;

// #215: the app-wide monthly rate limit (ADR-0020). Uses
// SmallMonthlyLimitDatabaseFixture (cap of 3, see DatabaseFixture.cs)
// rather than the real default of 100, so exhausting the cap doesn't
// require 100 HTTP round-trips -- also doubles as proof the cap is read
// from configuration rather than hardcoded, since it trips at request 4
// here instead of request 101.
public class AiBulkGenerationMonthlyRateLimitTests(SmallMonthlyLimitDatabaseFixture fixture)
    : IClassFixture<SmallMonthlyLimitDatabaseFixture>, IAsyncLifetime
{
    private const int MonthlyLimit = 3;

    // The monthly count is a single row keyed by calendar month, persisted
    // in the one Postgres database this fixture boots for the whole class
    // (IClassFixture) -- without clearing it before each test, whichever
    // test method runs first would consume slots every later method also
    // assumes are still free.
    public async Task InitializeAsync()
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.AiBulkGenerationMonthlyUsage.RemoveRange(db.AiBulkGenerationMonthlyUsage);
        await db.SaveChangesAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Once_the_monthly_cap_is_reached_further_requests_receive_429_with_a_monthly_specific_message()
    {
        await ExhaustMonthlyLimitAsync();

        using var client = await AuthenticatedClientAsync();
        var response = await client.PostAsJsonAsync(
            "/ai-bulk-generation",
            new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated("One too many")));

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(body);
        Assert.Contains("reached its limit for this month", body!.Detail);
    }

    [Fact]
    public async Task The_monthly_cap_applies_regardless_of_which_teacher_makes_the_request()
    {
        // Each of MonthlyLimit requests below comes from its own brand-new
        // teacher (see ExhaustMonthlyLimitAsync), so none of them shares a
        // daily count with this one -- if the monthly cap were somehow
        // scoped per-teacher instead of app-wide, this fresh teacher would
        // not be blocked.
        await ExhaustMonthlyLimitAsync();

        using var freshTeacher = await AuthenticatedClientAsync();
        var response = await freshTeacher.PostAsJsonAsync(
            "/ai-bulk-generation",
            new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated("Still blocked")));

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }

    [Fact]
    public async Task Blocked_request_never_reaches_the_curriculum_client()
    {
        await ExhaustMonthlyLimitAsync();

        using var client = await AuthenticatedClientAsync();
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
    public async Task The_monthly_count_is_persisted_in_the_database_not_process_memory()
    {
        await ExhaustMonthlyLimitAsync();

        // Reads the row directly out of the real Postgres container this
        // fixture boots, via a fresh DbContext scope -- not through any
        // object this test process has held onto -- proving the count lives
        // in the database rather than in the rate limiter's own memory.
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var usage = await db.AiBulkGenerationMonthlyUsage.SingleAsync();

        Assert.Equal(MonthlyLimit, usage.Count);
    }

    private async Task ExhaustMonthlyLimitAsync()
    {
        for (var i = 0; i < MonthlyLimit; i++)
        {
            using var client = await AuthenticatedClientAsync();
            var response = await client.PostAsJsonAsync(
                "/ai-bulk-generation",
                new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated($"Subject {i}")));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
    }

    // Same pattern as AiBulkGenerationEndpointsTests -- a brand-new teacher
    // per call, so no test here accidentally also trips the (much higher,
    // default) daily cap for a single teacher.
    private async Task<HttpClient> AuthenticatedClientAsync()
    {
        var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims(
            $"sub-ai-bulk-generation-monthly-{Guid.NewGuid()}",
            "ai-bulk-generation-monthly@example.com",
            emailVerified: true);

        var login = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));
        var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Token);
        return client;
    }
}
