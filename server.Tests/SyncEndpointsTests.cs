using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using server.Auth;
using server.Sync;

namespace server.Tests;

// Exercises #20's push/pull sync protocol against the real Minimal API
// pipeline (via DatabaseFixture). Cases mirror #7's resolved design: batched
// push with per-row ownership checks and echoed post-merge values,
// incremental pull scoped to the caller's own data.
public class SyncEndpointsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task Push_creates_rows_and_echoes_post_merge_values()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-push-create");
        Authorize(client, token);

        var classRow = NewClass(userId, name: "Room 5");
        var subjectRow = NewSubject(classRow.Id, name: "Math");
        var studentRow = NewStudent(classRow.Id, name: "Alex");
        var lessonRow = NewLesson(subjectRow.Id, unit: 1, lessonInUnit: 1);
        var progressRow = NewProgress(studentRow.Id, subjectRow.Id);

        var response = await client.PostAsJsonAsync("/sync/push", new SyncBatch(
            [classRow], [subjectRow], [lessonRow], [studentRow], [progressRow]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SyncBatch>();

        var echoedClass = Assert.Single(body!.Classes);
        Assert.Equal(classRow.Id, echoedClass.Id);
        Assert.Equal("Room 5", echoedClass.Name);

        var echoedSubject = Assert.Single(body.Subjects);
        Assert.Equal(subjectRow.Id, echoedSubject.Id);

        var echoedStudent = Assert.Single(body.Students);
        Assert.Equal(studentRow.Id, echoedStudent.Id);

        var echoedLesson = Assert.Single(body.Lessons);
        Assert.Equal(lessonRow.Id, echoedLesson.Id);

        var echoedProgress = Assert.Single(body.Progress);
        Assert.Equal(progressRow.Id, echoedProgress.Id);
        Assert.Equal(progressRow.StepHlc, echoedProgress.StepHlc);
    }

    [Fact]
    public async Task Push_rejects_a_class_claimed_for_another_user()
    {
        using var client = fixture.CreateClient();
        var (tokenA, _) = await LoginAsync(client, "sub-claim-a");
        var (_, userIdB) = await LoginAsync(client, "sub-claim-b");
        Authorize(client, tokenA);

        // Authenticated as A but the payload claims the row belongs to B.
        var response = await client.PostAsJsonAsync("/sync/push", new SyncBatch(
            [NewClass(userIdB)], [], [], [], []));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Push_rejects_hijacking_an_existing_class_owned_by_another_user()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-hijack-a");
        var (tokenB, userIdB) = await LoginAsync(client, "sub-hijack-b");

        Authorize(client, tokenA);
        var classRow = NewClass(userIdA);
        await client.PostAsJsonAsync("/sync/push", new SyncBatch([classRow], [], [], [], []));

        // B claims the row as their own (row.UserId == B), but the row already
        // exists server-side under A's ownership.
        Authorize(client, tokenB);
        var response = await client.PostAsJsonAsync("/sync/push", new SyncBatch(
            [classRow with { UserId = userIdB }], [], [], [], []));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Push_rejects_a_subject_referencing_a_class_not_owned_by_the_caller()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-subject-a");
        var (tokenB, _) = await LoginAsync(client, "sub-subject-b");

        Authorize(client, tokenA);
        var classRow = NewClass(userIdA);
        await client.PostAsJsonAsync("/sync/push", new SyncBatch([classRow], [], [], [], []));

        Authorize(client, tokenB);
        var response = await client.PostAsJsonAsync("/sync/push", new SyncBatch(
            [], [NewSubject(classRow.Id)], [], [], []));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Push_merges_progress_fields_independently_by_hlc()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-progress-merge");
        Authorize(client, token);

        var classRow = NewClass(userId);
        var subjectRow = NewSubject(classRow.Id);
        var studentRow = NewStudent(classRow.Id);
        await client.PostAsJsonAsync("/sync/push", new SyncBatch(
            [classRow], [subjectRow], [], [studentRow], []));

        var firstDeviceRow = NewProgress(
            studentRow.Id, subjectRow.Id,
            stepUnit: 1, stepHlc: "hlc-1",
            review: false, reviewHlc: "hlc-1");
        var firstResponse = await client.PostAsJsonAsync("/sync/push", new SyncBatch(
            [], [], [], [], [firstDeviceRow]));
        var firstBody = await firstResponse.Content.ReadFromJsonAsync<SyncBatch>();
        var canonicalId = Assert.Single(firstBody!.Progress).Id;

        // A second device, never having synced with the first, independently
        // created its own row (different id) for the same (student, subject)
        // cell -- an older step (loses) and a newer review (wins).
        var secondDeviceRow = NewProgress(
            studentRow.Id, subjectRow.Id,
            stepUnit: 99, stepHlc: "hlc-0",
            review: true, reviewHlc: "hlc-2");
        var secondResponse = await client.PostAsJsonAsync("/sync/push", new SyncBatch(
            [], [], [], [], [secondDeviceRow]));

        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        var secondBody = await secondResponse.Content.ReadFromJsonAsync<SyncBatch>();
        var merged = Assert.Single(secondBody!.Progress);

        Assert.Equal(canonicalId, merged.Id);
        Assert.Equal(1, merged.StepUnit);
        Assert.Equal("hlc-1", merged.StepHlc);
        Assert.True(merged.Review);
        Assert.Equal("hlc-2", merged.ReviewHlc);
    }

    [Fact]
    public async Task Pull_returns_only_the_authenticated_users_own_rows()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-pull-scope-a");
        var (tokenB, userIdB) = await LoginAsync(client, "sub-pull-scope-b");

        Authorize(client, tokenA);
        var classA = NewClass(userIdA, name: "A's class");
        await client.PostAsJsonAsync("/sync/push", new SyncBatch([classA], [], [], [], []));

        Authorize(client, tokenB);
        var classB = NewClass(userIdB, name: "B's class");
        await client.PostAsJsonAsync("/sync/push", new SyncBatch([classB], [], [], [], []));

        var pullResponse = await client.GetAsync("/sync/pull");
        var pullBody = await pullResponse.Content.ReadFromJsonAsync<SyncPullResponse>();

        Assert.Contains(pullBody!.Classes, c => c.Id == classB.Id);
        Assert.DoesNotContain(pullBody.Classes, c => c.Id == classA.Id);
    }

    [Fact]
    public async Task Pull_since_a_watermark_returns_only_rows_updated_after_it()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-pull-watermark");
        Authorize(client, token);

        var firstClass = NewClass(userId, name: "First");
        await client.PostAsJsonAsync("/sync/push", new SyncBatch([firstClass], [], [], [], []));

        var firstPull = await client.GetAsync("/sync/pull");
        var firstPullBody = await firstPull.Content.ReadFromJsonAsync<SyncPullResponse>();
        Assert.Contains(firstPullBody!.Classes, c => c.Id == firstClass.Id);

        var secondClass = NewClass(userId, name: "Second");
        await client.PostAsJsonAsync("/sync/push", new SyncBatch([secondClass], [], [], [], []));

        var watermark = Uri.EscapeDataString(firstPullBody.Watermark.ToString("o"));
        var secondPull = await client.GetAsync($"/sync/pull?since={watermark}");
        var secondPullBody = await secondPull.Content.ReadFromJsonAsync<SyncPullResponse>();

        Assert.Contains(secondPullBody!.Classes, c => c.Id == secondClass.Id);
        Assert.DoesNotContain(secondPullBody.Classes, c => c.Id == firstClass.Id);
    }

    [Fact]
    public async Task Pull_with_no_since_returns_the_full_snapshot()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-pull-snapshot");
        Authorize(client, token);

        var classRow = NewClass(userId);
        var subjectRow = NewSubject(classRow.Id);
        var studentRow = NewStudent(classRow.Id);
        var lessonRow = NewLesson(subjectRow.Id);
        var progressRow = NewProgress(studentRow.Id, subjectRow.Id);
        await client.PostAsJsonAsync("/sync/push", new SyncBatch(
            [classRow], [subjectRow], [lessonRow], [studentRow], [progressRow]));

        var response = await client.GetAsync("/sync/pull");
        var body = await response.Content.ReadFromJsonAsync<SyncPullResponse>();

        Assert.Contains(body!.Classes, c => c.Id == classRow.Id);
        Assert.Contains(body.Subjects, s => s.Id == subjectRow.Id);
        Assert.Contains(body.Students, s => s.Id == studentRow.Id);
        Assert.Contains(body.Lessons, l => l.Id == lessonRow.Id);
        Assert.Contains(body.Progress, p => p.Id == progressRow.Id);
    }

    private static async Task<(string Token, Guid UserId)> LoginAsync(HttpClient client, string subjectSeed)
    {
        var credential = StubGoogleTokenVerifier.ForClaims(subjectSeed, $"{subjectSeed}@example.com", emailVerified: true);
        var response = await client.PostAsJsonAsync("/auth/google", new GoogleSignInRequest(credential));
        var body = await response.Content.ReadFromJsonAsync<AuthResponse>();
        return (body!.Token, body.UserId);
    }

    private static void Authorize(HttpClient client, string token) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

    private static ClassSyncRow NewClass(Guid userId, Guid? id = null, string name = "Room 5") =>
        new(id ?? Guid.NewGuid(), userId, name, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null);

    private static SubjectSyncRow NewSubject(Guid classId, Guid? id = null, string name = "Math", int position = 0) =>
        new(id ?? Guid.NewGuid(), classId, name, position, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null);

    private static StudentSyncRow NewStudent(Guid classId, Guid? id = null, string name = "Alex", int position = 0) =>
        new(id ?? Guid.NewGuid(), classId, name, position, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null);

    private static LessonSyncRow NewLesson(Guid subjectId, Guid? id = null, int unit = 1, int lessonInUnit = 1) =>
        new(id ?? Guid.NewGuid(), subjectId, unit, lessonInUnit, "Fractions", "Intro to fractions",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null);

    private static ProgressSyncRow NewProgress(
        Guid studentId,
        Guid subjectId,
        Guid? id = null,
        int stepUnit = 1,
        int stepLessonInUnit = 1,
        string stepHlc = "hlc-1",
        bool review = false,
        string reviewHlc = "hlc-1") =>
        new(id ?? Guid.NewGuid(), studentId, subjectId, stepUnit, stepLessonInUnit, stepHlc, Guid.NewGuid(),
            review, reviewHlc, Guid.NewGuid(), DateTimeOffset.UtcNow);
}
