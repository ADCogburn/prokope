namespace server.Auth;

public record GoogleSignInRequest(string Credential);

public record AuthResponse(string Token, Guid UserId, string Email);

public record MeResponse(Guid UserId, string Email);
