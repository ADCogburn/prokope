namespace server.Data.Entities;

public class Lesson
{
    public Guid Id { get; set; }
    public Guid SubjectId { get; set; }
    public int Unit { get; set; }
    public int LessonInUnit { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
}
