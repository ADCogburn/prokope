using Google.Apis.Auth;

namespace server.Auth;

// Validates the token's audience/issuer/signature/expiry against Google's
// published keys via Google.Apis.Auth's standard validation helper.
public class GoogleTokenVerifier(IConfiguration configuration) : IGoogleTokenVerifier
{
    public async Task<GoogleTokenVerificationResult> VerifyAsync(string idToken, CancellationToken cancellationToken = default)
    {
        var clientId = configuration["Google:ClientId"];
        var settings = new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = clientId is null ? [] : [clientId],
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
