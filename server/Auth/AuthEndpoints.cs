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
            return Results.Ok(new AuthResponse(token, user.Id, user.Email, user.IsDemo));
        })
        .WithName("GoogleSignIn");

        app.MapPost("/auth/demo", async (
            IConfiguration configuration,
            ISessionTokenService tokenService,
            AppDbContext db,
            CancellationToken cancellationToken) =>
        {
            // Config-flag gated (App:DemoAccountEnabled), not eagerly read at
            // startup like Google:ClientId: unlike Google sign-in, the whole
            // app isn't unusable without this, so a missing/false flag should
            // just disable the one endpoint, not fail the container to boot.
            if (!configuration.GetValue<bool>("App:DemoAccountEnabled"))
            {
                return Results.Problem(
                    detail: "Demo accounts are currently disabled.",
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var user = new User
            {
                Id = Guid.NewGuid(),
                GoogleSub = null,
                Email = $"demo-{Guid.NewGuid():N}@demo.prokope.local",
                CreatedAt = DateTimeOffset.UtcNow,
                IsDemo = true,
            };
            db.Users.Add(user);
            DemoAccountSeeder.Seed(db, user.Id);
            await db.SaveChangesAsync(cancellationToken);

            var token = tokenService.IssueToken(user.Id);
            return Results.Ok(new AuthResponse(token, user.Id, user.Email, user.IsDemo));
        })
        .WithName("DemoSignIn");

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

            return Results.Ok(new MeResponse(user.Id, user.Email, user.IsDemo));
        })
        .WithName("GetCurrentUser")
        .RequireAuthorization();
    }
}
