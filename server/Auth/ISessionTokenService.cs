namespace server.Auth;

// Issues the API's own signed session token (a JWT) once a Google identity
// has been verified and a user row resolved. Kept separate from
// IGoogleTokenVerifier: this is the API's own signing concern, unrelated to
// how the caller's identity was established.
public interface ISessionTokenService
{
    string IssueToken(Guid userId);
}
