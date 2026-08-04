namespace server.Data.Entities;

public class User
{
    public Guid Id { get; set; }
    public required string GoogleSub { get; set; }
    public required string Email { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
