namespace server.Tests;

// Verifies the "SpaOrigin" CORS policy from #17: the configured SPA origin
// is allowed, and an arbitrary origin is not -- exercised against the real
// middleware pipeline rather than asserted from the policy object.
public class CorsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task Allowed_origin_receives_cors_header()
    {
        using var client = fixture.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Origin", DatabaseFixture.AllowedSpaOrigin);

        var response = await client.SendAsync(request);

        Assert.Equal(
            DatabaseFixture.AllowedSpaOrigin,
            Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
    }

    [Fact]
    public async Task Disallowed_origin_receives_no_cors_header()
    {
        using var client = fixture.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Origin", "https://evil.example");

        var response = await client.SendAsync(request);

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
