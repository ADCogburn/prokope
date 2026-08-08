using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using server.AiBulkGeneration;
using server.Auth;

namespace server.Tests;

// Exercises the externally-observable HTTP contract of #197's AI Bulk
// Generation endpoint against the real Minimal API pipeline (via
// DatabaseFixture), with StubAnthropicCurriculumClient standing in for
// Anthropic's network. Cases mirror #192's three-outcome seam: generated,
// not-found, failed. Follows AuthEndpointsTests.cs's pattern of asserting
// purely on the HTTP contract, never the interface/delegate directly.
public class AiBulkGenerationEndpointsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task Generated_curriculum_returns_200_with_a_lesson_list()
    {
        using var client = await AuthenticatedClientAsync();
        var curriculumName = StubAnthropicCurriculumClient.Generated("Algebra 1");

        var response = await client.PostAsJsonAsync("/ai-bulk-generation", new AiBulkGenerationRequest(curriculumName));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AiBulkGenerationResponse>();
        Assert.NotNull(body);
        Assert.NotEmpty(body!.Lessons);
        Assert.All(body.Lessons, lesson =>
        {
            Assert.True(lesson.Unit > 0);
            Assert.True(lesson.LessonInUnit > 0);
            Assert.False(string.IsNullOrWhiteSpace(lesson.Title));
            Assert.False(string.IsNullOrWhiteSpace(lesson.Description));
        });
    }

    [Fact]
    public async Task Unknown_curriculum_returns_404_with_a_distinct_body()
    {
        using var client = await AuthenticatedClientAsync();
        var curriculumName = StubAnthropicCurriculumClient.NotFound("Nonexistent Curriculum");

        var response = await client.PostAsJsonAsync("/ai-bulk-generation", new AiBulkGenerationRequest(curriculumName));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AiBulkGenerationNotFoundResponse>();
        Assert.NotNull(body);
        Assert.Equal(curriculumName, body!.CurriculumName);
        Assert.False(string.IsNullOrWhiteSpace(body.Message));
    }

    [Fact]
    public async Task Generation_failure_returns_a_problem_response()
    {
        using var client = await AuthenticatedClientAsync();
        var curriculumName = StubAnthropicCurriculumClient.Failed("Chemistry");

        var response = await client.PostAsJsonAsync("/ai-bulk-generation", new AiBulkGenerationRequest(curriculumName));

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task Endpoint_requires_authentication()
    {
        using var client = fixture.CreateClient();
        var curriculumName = StubAnthropicCurriculumClient.Generated("Algebra 1");

        var response = await client.PostAsJsonAsync("/ai-bulk-generation", new AiBulkGenerationRequest(curriculumName));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // Logs in via the stub Google verifier (same as AuthEndpointsTests) to
    // obtain a real bearer token, since this endpoint requires
    // authorization like every other per-user feature endpoint.
    private async Task<HttpClient> AuthenticatedClientAsync()
    {
        var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims(
            $"sub-ai-bulk-generation-{Guid.NewGuid()}", "ai-bulk-generation@example.com", emailVerified: true);

        var login = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));
        var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Token);
        return client;
    }
}
