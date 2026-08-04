using Google.Apis.Auth;

namespace server.Auth;

// Validates the token's audience/issuer/signature/expiry against Google's
// published keys via Google.Apis.Auth's standard validation helper. Takes
// the client ID directly (resolved eagerly at startup in Program.cs,
// alongside the Jwt config) rather than reading IConfiguration per request:
// an empty audience list makes GoogleJsonWebSignature skip audience
// validation entirely, silently accepting tokens issued for any Google
// OAuth client, so a missing Google:ClientId must fail the app at boot,
// not degrade quietly on the first sign-in attempt.
public class GoogleTokenVerifier(string clientId) : IGoogleTokenVerifier
{
    public async Task<GoogleTokenVerificationResult> VerifyAsync(string idToken, CancellationToken cancellationToken = default)
    {
        var settings = new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = [clientId],
        };

        try
        {
            var payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
            return GoogleTokenVerificationResult.Verified(payload.Subject, payload.Email, payload.EmailVerified);
        }
        catch (InvalidJwtException)
        {
            return GoogleTokenVerificationResult.Failed;
        }
    }
}
