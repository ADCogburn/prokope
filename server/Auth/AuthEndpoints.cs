using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using server.Data;
using server.Data.Entities;

namespace server.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/auth/google", async (
            GoogleSignInRequest request,
            IGoogleTokenVerifier verifier,
            ISessionTokenService tokenService,
            AppDbContext db,
            CancellationToken cancellationToken) =>
        {
            var verification = await verifier.VerifyAsync(request.Credential, cancellationToken);
            if (!verification.Success || !verification.EmailVerified)
            {
                return Results.Unauthorized();
            }

            var user = await db.Users.SingleOrDefaultAsync(u => u.GoogleSub == verification.Subject, cancellationToken);
            if (user is null)
            {
                user = new User
                {
                    Id = Guid.NewGuid(),
                    GoogleSub = verification.Subject!,
                    Email = verification.Email!,
                    CreatedAt = DateTimeOffset.UtcNow,
                };
                db.Users.Add(user);
                await db.SaveChangesAsync(cancellationToken);
            }

            var token = tokenService.IssueToken(user.Id);
            return Results.Ok(new AuthResponse(token, user.Id, user.Email));
        })
        .WithName("GoogleSignIn");

        app.MapGet("/auth/me", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            CancellationToken cancellationToken) =>
        {
            var subject = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (subject is null || !Guid.TryParse(subject, out var userId))
            {
                return Results.Unauthorized();
            }

            var user = await db.Users.FindAsync([userId], cancellationToken);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(new MeResponse(user.Id, user.Email));
        })
        .WithName("GetCurrentUser")
        .RequireAuthorization();
    }
}
