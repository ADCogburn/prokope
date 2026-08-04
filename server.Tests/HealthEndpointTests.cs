using System.Net;

namespace server.Tests;

// Verifies the health-check endpoint added in #15: something concrete for both
// this ticket's docker build+run test and a post-deploy manual check to hit,
// confirming the container is up and has already run its migrations (Program.cs
// runs db.Database.Migrate() before the app starts accepting requests).
public class HealthEndpointTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task Health_returns_200()
    {
        using var client = fixture.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
