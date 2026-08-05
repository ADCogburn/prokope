namespace server.Data.Entities;

public class User
{
    public Guid Id { get; set; }

    // Null for Demo Account rows (IsDemo = true), which skip Google
    // verification entirely -- see #32.
    public string? GoogleSub { get; set; }
    public required string Email { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public bool IsDemo { get; set; }
}
