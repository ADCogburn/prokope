using server.Auth;

namespace server.Tests;

// Test double for IGoogleTokenVerifier: the desired verification outcome is
// encoded directly in the "credential" string, so tests can drive every case
// (verified claims, unverified email, invalid credential) through the real
// POST /auth/google endpoint without ever calling Google's network.
public class StubGoogleTokenVerifier : IGoogleTokenVerifier
{
    private const string Prefix = "stub-credential:";

    // Any credential that isn't in this encoded form -- including this
    // constant -- fails verification, simulating an invalid/tampered token.
    public const string Invalid = "not-a-real-google-credential";

    public static string ForClaims(string subject, string email, bool emailVerified) =>
        $"{Prefix}{subject}|{email}|{emailVerified}";

    public Task<GoogleTokenVerificationResult> VerifyAsync(string idToken, CancellationToken cancellationToken = default)
    {
        if (!idToken.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return Task.FromResult(GoogleTokenVerificationResult.Failed);
        }

        var parts = idToken[Prefix.Length..].Split('|');
        var result = GoogleTokenVerificationResult.Verified(
            subject: parts[0],
            email: parts[1],
            emailVerified: bool.Parse(parts[2]));

        return Task.FromResult(result);
    }
}
