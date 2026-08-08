namespace server.Data.Entities;

// #168: one Lesson captured into a ClassTemplateSubject at save time.
// Immutable/create-only -- no DeletedAt.
public class ClassTemplateLesson
{
    public Guid Id { get; set; }
    public Guid ClassTemplateSubjectId { get; set; }
    public int Unit { get; set; }
    public int LessonInUnit { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
