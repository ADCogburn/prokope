namespace server.Data.Entities;

// Per-lesson review flag (#152/ADR-0011), replacing the old per-(student,
// subject) Progress.Review/ReviewHlc/ReviewClientId trio. Keyed by
// (student, lesson) rather than (student, subject) so a flag can target any
// lesson -- past, current, or upcoming -- independent of the student's
// current position. Single-field HLC+client-id LWW-register, same shape as
// Progress.Step*.
public class ReviewFlag
{
    public Guid Id { get; set; }
    public Guid StudentId { get; set; }
    public Guid LessonId { get; set; }
    public bool Flagged { get; set; }
    public required string Hlc { get; set; }
    public Guid ClientId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
