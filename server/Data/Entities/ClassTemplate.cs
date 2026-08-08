namespace server.Data.Entities;

// #168: a saved snapshot of a Class's curriculum, keyed by user_id directly
// (not class_id) so it survives the source Class being renamed, edited, or
// deleted. Immutable/create-only -- no DeletedAt, nothing is ever updated
// after creation.
public class ClassTemplate
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
