using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using server.AiBulkGeneration;
using server.Auth;

namespace server.Tests;

// #215's cross-contamination requirement: the daily (#214, per-teacher,
// in-memory) and monthly (#215, app-wide, persisted) rate limits must be
// fully independent -- exhausting one never consumes or affects the
// other's count. Uses SmallDailyAndMonthlyLimitDatabaseFixture (daily cap
// 2, monthly cap 3) so both limits are reachable within the same test.
public class AiBulkGenerationRateLimitCrossContaminationTests(SmallDailyAndMonthlyLimitDatabaseFixture fixture)
    : IClassFixture<SmallDailyAndMonthlyLimitDatabaseFixture>
{
    [Fact]
    public async Task Exhausting_one_teacher_daily_cap_does_not_consume_the_monthly_budget()
    {
        // Teacher A: 2 successful requests (their full daily cap of 2), then
        // a 3rd that trips their own daily cap. If that blocked 3rd attempt
        // wrongly consumed a monthly slot too, the monthly total would sit
        // at 3/3 (exhausted) after just this one teacher -- instead of the
        // 2/3 it should be, since only the two *allowed* requests should
        // count.
        using var teacherA = await AuthenticatedClientAsync();
        await GenerateAsync(teacherA, "A1", HttpStatusCode.OK);
        await GenerateAsync(teacherA, "A2", HttpStatusCode.OK);

        var blockedForA = await GenerateAsync(teacherA, "A3", HttpStatusCode.TooManyRequests);
        var blockedBody = await blockedForA.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Contains("today", blockedBody!.Detail);

        // A fresh teacher B, with their own unused daily cap, should still
        // be able to use the monthly budget's last remaining slot (2 used
        // by teacher A's allowed requests + this one = 3/3) -- proving
        // teacher A's blocked 3rd attempt didn't silently consume it.
        using var teacherB = await AuthenticatedClientAsync();
        await GenerateAsync(teacherB, "B1", HttpStatusCode.OK);
    }

    [Fact]
    public async Task Exhausting_the_monthly_cap_does_not_trip_any_single_teacher_own_daily_cap()
    {
        // Three different teachers, one request each, exhausts the monthly
        // cap of 3 -- none of them is anywhere near their own daily cap of 2.
        using var teacherA = await AuthenticatedClientAsync();
        using var teacherB = await AuthenticatedClientAsync();
        using var teacherC = await AuthenticatedClientAsync();
        await GenerateAsync(teacherA, "A1", HttpStatusCode.OK);
        await GenerateAsync(teacherB, "B1", HttpStatusCode.OK);
        await GenerateAsync(teacherC, "C1", HttpStatusCode.OK);

        // Teacher A tries again -- still well under their own daily cap of
        // 2 (this would be their 2nd request), so a block here must be the
        // monthly message, not the daily one.
        var blocked = await GenerateAsync(teacherA, "A2", HttpStatusCode.TooManyRequests);
        var body = await blocked.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Contains("this month", body!.Detail);
    }

    private static async Task<HttpResponseMessage> GenerateAsync(
        HttpClient client, string curriculumSuffix, HttpStatusCode expectedStatus)
    {
        var response = await client.PostAsJsonAsync(
            "/ai-bulk-generation",
            new AiBulkGenerationRequest(StubAnthropicCurriculumClient.Generated(curriculumSuffix)));
        Assert.Equal(expectedStatus, response.StatusCode);
        return response;
    }

    private async Task<HttpClient> AuthenticatedClientAsync()
    {
        var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims(
            $"sub-ai-bulk-generation-cross-{Guid.NewGuid()}",
            "ai-bulk-generation-cross@example.com",
            emailVerified: true);

        var login = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));
        var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Token);
        return client;
    }
}
