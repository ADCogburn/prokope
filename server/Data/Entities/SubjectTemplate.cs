namespace server.Data.Entities;

// #165: keyed by UserId directly (not a Class/Subject FK) so a Template
// outlives its source. Immutable once created -- no DeletedAt/UpdatedAt
// mutation path exists in #147 -- but UpdatedAt is still carried (stamped
// once at creation) since sync's pull/push watermark math treats it as
// present on every row, same reasoning as the client's SubjectTemplateRow.
public class SubjectTemplate
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
