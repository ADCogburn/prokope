using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using server.Auth;

namespace server.Tests;

// Exercises the externally-observable HTTP contract of #18's auth flow
// against the real Minimal API pipeline (via DatabaseFixture), with
// StubGoogleTokenVerifier standing in for Google's network. Cases mirror
// #18's own "Testing Decisions" list.
public class AuthEndpointsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task First_login_provisions_a_user()
    {
        using var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims("sub-new-teacher", "new.teacher@example.com", emailVerified: true);

        var response = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrWhiteSpace(body!.Token));
        Assert.NotEqual(Guid.Empty, body.UserId);
        Assert.Equal("new.teacher@example.com", body.Email);
    }

    [Fact]
    public async Task Repeat_login_reuses_the_same_user()
    {
        using var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims("sub-returning-teacher", "returning.teacher@example.com", emailVerified: true);

        var first = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));
        var second = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));

        var firstBody = await first.Content.ReadFromJsonAsync<AuthResponse>();
        var secondBody = await second.Content.ReadFromJsonAsync<AuthResponse>();

        Assert.Equal(firstBody!.UserId, secondBody!.UserId);
    }

    [Fact]
    public async Task Unverified_email_is_rejected()
    {
        using var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims("sub-unverified", "unverified@example.com", emailVerified: false);

        var response = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Invalid_credential_is_rejected()
    {
        using var client = fixture.CreateClient();

        var response = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(StubGoogleTokenVerifier.Invalid));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_succeeds_with_a_valid_token()
    {
        using var client = fixture.CreateClient();
        var credential = StubGoogleTokenVerifier.ForClaims("sub-me-teacher", "me.teacher@example.com", emailVerified: true);
        var login = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));
        var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Token);
        var response = await client.GetAsync("/auth/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var meBody = await response.Content.ReadFromJsonAsync<MeResponse>();
        Assert.Equal(loginBody.UserId, meBody!.UserId);
        Assert.Equal("me.teacher@example.com", meBody.Email);
    }

    [Fact]
    public async Task Me_returns_401_with_no_token()
    {
        using var client = fixture.CreateClient();

        var response = await client.GetAsync("/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_returns_401_with_an_invalid_token()
    {
        using var client = fixture.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-real-jwt");

        var response = await client.GetAsync("/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_returns_401_with_an_expired_token()
    {
        using var client = fixture.CreateClient();
        var expiredToken = CreateToken(Guid.NewGuid(), DateTime.UtcNow.AddDays(-1));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", expiredToken);

        var response = await client.GetAsync("/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // Mints a token against the same signing key/issuer the running app
    // validates against (DatabaseFixture.JwtSigningKey/JwtIssuer), so this
    // test controls the expiry directly rather than waiting on a real one.
    private static string CreateToken(Guid userId, DateTime expires)
    {
        var key = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(DatabaseFixture.JwtSigningKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: DatabaseFixture.JwtIssuer,
            audience: DatabaseFixture.JwtIssuer,
            claims: [new Claim(JwtRegisteredClaimNames.Sub, userId.ToString())],
            expires: expires,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
