using server.Data;
using server.Data.Entities;

namespace server.Auth;

// Hardcoded sample Class -- not a DB template row copied at runtime, per #32.
// Every "Explore as Guest" click runs this again, seeding a fresh, isolated
// copy scoped to the new Demo Account's UserId. Entities are added to the
// context but not saved here; the caller (AuthEndpoints) commits everything
// -- the new User row and this seed data -- in one SaveChangesAsync.
public static class DemoAccountSeeder
{
    private static readonly string[] StudentNames = ["Ava", "Ben", "Chloe", "Diego", "Emma"];

    public static void Seed(AppDbContext db, Guid userId)
    {
        var now = DateTimeOffset.UtcNow;
        var hlcCounter = 0;

        var classId = Guid.NewGuid();
        db.Classes.Add(new Class
        {
            Id = classId,
            UserId = userId,
            Name = "Room 12 (Demo)",
            CreatedAt = now,
            UpdatedAt = now,
        });

        var studentIds = new List<Guid>();
        for (var position = 0; position < StudentNames.Length; position++)
        {
            var studentId = Guid.NewGuid();
            studentIds.Add(studentId);
            db.Students.Add(new Student
            {
                Id = studentId,
                ClassId = classId,
                Name = StudentNames[position],
                Position = position,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        SeedSubject(db, classId, studentIds, now, ref hlcCounter, position: 0, name: "Math",
            lessons:
            [
                (1, 1, "Counting to 10", "Recognize and count objects up to ten."),
                (1, 2, "Addition Basics", "Add single-digit numbers within 10."),
                (1, 3, "Subtraction Basics", "Subtract single-digit numbers within 10."),
                (2, 1, "Intro to Multiplication", "Understand multiplication as repeated addition."),
                (2, 2, "Skip Counting", "Count by 2s, 5s, and 10s."),
            ],
            // Ava ahead; Ben on-track but flagged; Chloe behind; Diego on-track but flagged; Emma just started.
            progress: [(2, 2, false), (1, 3, true), (1, 1, false), (1, 2, true), (1, 1, false)]);

        SeedSubject(db, classId, studentIds, now, ref hlcCounter, position: 1, name: "Reading",
            lessons:
            [
                (1, 1, "Letter Sounds", "Match consonant and short vowel sounds to letters."),
                (1, 2, "Sight Words", "Read common sight words on sight."),
                (1, 3, "Simple Sentences", "Read short sentences built from sight words."),
                (2, 1, "Story Sequencing", "Put story events in beginning-middle-end order."),
                (2, 2, "Main Idea", "Identify the main idea of a short passage."),
            ],
            // Ava and Ben ahead; Chloe on-track; Diego behind and flagged; Emma just started.
            progress: [(2, 1, false), (2, 2, false), (1, 2, false), (1, 1, true), (1, 1, false)]);

        SeedSubject(db, classId, studentIds, now, ref hlcCounter, position: 2, name: "Science",
            lessons:
            [
                (1, 1, "Living vs. Non-Living", "Sort objects as living or non-living."),
                (1, 2, "Plant Needs", "Identify what plants need to grow."),
                (2, 1, "Weather Patterns", "Describe daily weather using simple vocabulary."),
                (2, 2, "The Water Cycle", "Sequence the stages of the water cycle."),
            ],
            // Ava ahead; Ben on-track; Chloe behind and flagged; Diego and Emma just started.
            progress: [(2, 2, false), (1, 2, false), (1, 1, true), (1, 1, false), (1, 1, false)]);
    }

    private static void SeedSubject(
        AppDbContext db,
        Guid classId,
        List<Guid> studentIds,
        DateTimeOffset now,
        ref int hlcCounter,
        int position,
        string name,
        (int Unit, int LessonInUnit, string Title, string Description)[] lessons,
        (int StepUnit, int StepLessonInUnit, bool Review)[] progress)
    {
        var subjectId = Guid.NewGuid();
        db.Subjects.Add(new Subject
        {
            Id = subjectId,
            ClassId = classId,
            Name = name,
            Position = position,
            CreatedAt = now,
            UpdatedAt = now,
        });

        // Tracked by (unit, lesson_in_unit) so the review-flag seeding below
        // (#152/ADR-0011) can resolve each flagged student's current step to
        // the lesson id ReviewFlag is now keyed against.
        var lessonIdsByPosition = new Dictionary<(int Unit, int LessonInUnit), Guid>();
        foreach (var (unit, lessonInUnit, title, description) in lessons)
        {
            var lessonId = Guid.NewGuid();
            lessonIdsByPosition[(unit, lessonInUnit)] = lessonId;
            db.Lessons.Add(new Lesson
            {
                Id = lessonId,
                SubjectId = subjectId,
                Unit = unit,
                LessonInUnit = lessonInUnit,
                Title = title,
                Description = description,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        for (var i = 0; i < studentIds.Count; i++)
        {
            var (stepUnit, stepLessonInUnit, review) = progress[i];
            db.Progress.Add(new Progress
            {
                Id = Guid.NewGuid(),
                StudentId = studentIds[i],
                SubjectId = subjectId,
                StepUnit = stepUnit,
                StepLessonInUnit = stepLessonInUnit,
                StepHlc = NextHlc(now, ref hlcCounter),
                StepClientId = Guid.NewGuid(),
                UpdatedAt = now,
            });

            // Interim behavior per #152: only the current-lesson flag is
            // representable now that review lives on ReviewFlag, keyed by
            // lesson rather than subject -- so this only seeds a flag when
            // the student's current step actually lands on a real lesson.
            if (review && lessonIdsByPosition.TryGetValue((stepUnit, stepLessonInUnit), out var lessonId))
            {
                db.ReviewFlags.Add(new ReviewFlag
                {
                    Id = Guid.NewGuid(),
                    StudentId = studentIds[i],
                    LessonId = lessonId,
                    Flagged = true,
                    Hlc = NextHlc(now, ref hlcCounter),
                    ClientId = Guid.NewGuid(),
                    UpdatedAt = now,
                });
            }
        }
    }

    // Matches the client's HLC encoding (src/db/hlc.ts) -- 15-digit physical
    // ms + 10-digit logical counter -- so a real device's later edit always
    // sorts after these seeded values under SyncEndpoints' ordinal HlcWins.
    private static string NextHlc(DateTimeOffset now, ref int counter)
    {
        counter++;
        return $"{now.ToUnixTimeMilliseconds():D15}-{counter:D10}";
    }
}
