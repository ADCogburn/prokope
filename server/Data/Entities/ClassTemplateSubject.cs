namespace server.Data.Entities;

// #168: one Subject captured into a ClassTemplate at save time. Immutable/
// create-only -- no DeletedAt.
public class ClassTemplateSubject
{
    public Guid Id { get; set; }
    public Guid ClassTemplateId { get; set; }
    public required string Name { get; set; }
    public int Position { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
