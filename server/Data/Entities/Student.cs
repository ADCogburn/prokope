namespace server.Data.Entities;

public class Student
{
    public Guid Id { get; set; }
    public Guid ClassId { get; set; }
    public required string Name { get; set; }
    public int Position { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
}
