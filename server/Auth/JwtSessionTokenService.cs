using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace server.Auth;

public class JwtSessionTokenService(IConfiguration configuration) : ISessionTokenService
{
    // Weeks-scale, not hours: no refresh-token flow for MVP, so a short
    // expiry would force teachers back through Google sign-in constantly.
    // An expired session just re-runs the sign-in button -- see #18.
    public static readonly TimeSpan Expiry = TimeSpan.FromDays(30);

    public string IssueToken(Guid userId)
    {
        var issuer = JwtConfiguration.Issuer(configuration);
        var credentials = new SigningCredentials(JwtConfiguration.SigningKey(configuration), SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: issuer,
            claims: [new Claim(JwtRegisteredClaimNames.Sub, userId.ToString())],
            expires: DateTime.UtcNow.Add(Expiry),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

// Shared between the token issuer above and the JWT bearer middleware setup
// in Program.cs, so the two sides can never validate against different
// issuer/key values.
public static class JwtConfiguration
{
    public static string Issuer(IConfiguration configuration) =>
        configuration["Jwt:Issuer"] ?? "prokope-api";

    public static SymmetricSecurityKey SigningKey(IConfiguration configuration)
    {
        var signingKey = configuration["Jwt:SigningKey"];
        if (string.IsNullOrEmpty(signingKey))
        {
            throw new InvalidOperationException("Jwt:SigningKey is not configured.");
        }

        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
    }
}
