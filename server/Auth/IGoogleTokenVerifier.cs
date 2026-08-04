namespace server.Auth;

// Verifies a Google Identity Services ID token and returns the claims it
// asserts. Kept behind this interface (rather than calling
// GoogleJsonWebSignature.ValidateAsync inline) so tests can swap in a stub
// that returns canned claims without a network call to Google.
public interface IGoogleTokenVerifier
{
    Task<GoogleTokenVerificationResult> VerifyAsync(string idToken, CancellationToken cancellationToken = default);
}

public record GoogleTokenVerificationResult
{
    public required bool Success { get; init; }
    public string? Subject { get; init; }
    public string? Email { get; init; }
    public bool EmailVerified { get; init; }

    public static GoogleTokenVerificationResult Failed { get; } = new() { Success = false };

    public static GoogleTokenVerificationResult Verified(string subject, string email, bool emailVerified) =>
        new() { Success = true, Subject = subject, Email = email, EmailVerified = emailVerified };
}
