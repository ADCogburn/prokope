namespace server.Data.Entities;

public class Progress
{
    public Guid Id { get; set; }
    public Guid StudentId { get; set; }
    public Guid SubjectId { get; set; }
    public int StepUnit { get; set; }
    public int StepLessonInUnit { get; set; }
    public required string StepHlc { get; set; }
    public Guid StepClientId { get; set; }
    public bool Review { get; set; }
    public required string ReviewHlc { get; set; }
    public Guid ReviewClientId { get; set; }
}
