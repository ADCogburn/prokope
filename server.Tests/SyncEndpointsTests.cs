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
        var reviewFlagRow = NewReviewFlag(studentRow.Id, lessonRow.Id);

        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            classes: [classRow], subjects: [subjectRow], lessons: [lessonRow], students: [studentRow],
            progress: [progressRow], reviewFlags: [reviewFlagRow]));

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

        var echoedReviewFlag = Assert.Single(body.ReviewFlags);
        Assert.Equal(reviewFlagRow.Id, echoedReviewFlag.Id);
        Assert.True(echoedReviewFlag.Flagged);
        Assert.Equal(reviewFlagRow.Hlc, echoedReviewFlag.Hlc);
    }

    [Fact]
    public async Task Push_creates_a_subject_template_and_its_lessons_in_the_same_batch()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-push-template-create");
        Authorize(client, token);

        var templateRow = NewSubjectTemplate(userId, name: "Math Template");
        var templateLessonRow = NewSubjectTemplateLesson(templateRow.Id, unit: 1, lessonInUnit: 1);

        // The template's owning row and its child lesson row arrive in the
        // same push batch -- mirrors #152's precedent for a subject and its
        // lesson created together (see the subject/lesson case above): the
        // lesson's ownership check must see the template that was just
        // created earlier in this same request, not only rows that already
        // existed server-side beforehand.
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            subjectTemplates: [templateRow], subjectTemplateLessons: [templateLessonRow]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SyncBatch>();

        var echoedTemplate = Assert.Single(body!.SubjectTemplates);
        Assert.Equal(templateRow.Id, echoedTemplate.Id);
        Assert.Equal("Math Template", echoedTemplate.Name);
        Assert.Equal(userId, echoedTemplate.UserId);

        var echoedLesson = Assert.Single(body.SubjectTemplateLessons);
        Assert.Equal(templateLessonRow.Id, echoedLesson.Id);
        Assert.Equal(templateRow.Id, echoedLesson.SubjectTemplateId);
        Assert.Equal(templateLessonRow.Title, echoedLesson.Title);
    }

    [Fact]
    public async Task Push_rejects_a_subject_template_claimed_for_another_user()
    {
        using var client = fixture.CreateClient();
        var (tokenA, _) = await LoginAsync(client, "sub-template-claim-a");
        var (_, userIdB) = await LoginAsync(client, "sub-template-claim-b");
        Authorize(client, tokenA);

        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            subjectTemplates: [NewSubjectTemplate(userIdB)]));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Push_rejects_a_subject_template_lesson_referencing_a_template_not_owned_by_the_caller()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-template-lesson-a");
        var (tokenB, _) = await LoginAsync(client, "sub-template-lesson-b");

        Authorize(client, tokenA);
        var templateRow = NewSubjectTemplate(userIdA);
        await client.PostAsJsonAsync("/sync/push", NewBatch(subjectTemplates: [templateRow]));

        Authorize(client, tokenB);
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            subjectTemplateLessons: [NewSubjectTemplateLesson(templateRow.Id)]));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Pull_returns_subject_templates_and_lessons_scoped_to_the_caller()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-template-pull-a");
        var (tokenB, userIdB) = await LoginAsync(client, "sub-template-pull-b");

        Authorize(client, tokenA);
        var templateA = NewSubjectTemplate(userIdA, name: "A's Template");
        var templateLessonA = NewSubjectTemplateLesson(templateA.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(
            subjectTemplates: [templateA], subjectTemplateLessons: [templateLessonA]));

        Authorize(client, tokenB);
        var templateB = NewSubjectTemplate(userIdB, name: "B's Template");
        await client.PostAsJsonAsync("/sync/push", NewBatch(subjectTemplates: [templateB]));

        var pullResponse = await client.GetAsync("/sync/pull");
        var pullBody = await pullResponse.Content.ReadFromJsonAsync<SyncPullResponse>();

        Assert.Contains(pullBody!.SubjectTemplates, t => t.Id == templateB.Id);
        Assert.DoesNotContain(pullBody.SubjectTemplates, t => t.Id == templateA.Id);
        Assert.DoesNotContain(pullBody.SubjectTemplateLessons, l => l.Id == templateLessonA.Id);
    }

    [Fact]
    public async Task Push_rejects_a_class_claimed_for_another_user()
    {
        using var client = fixture.CreateClient();
        var (tokenA, _) = await LoginAsync(client, "sub-claim-a");
        var (_, userIdB) = await LoginAsync(client, "sub-claim-b");
        Authorize(client, tokenA);

        // Authenticated as A but the payload claims the row belongs to B.
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(classes: [NewClass(userIdB)]));

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
        await client.PostAsJsonAsync("/sync/push", NewBatch(classes: [classRow]));

        // B claims the row as their own (row.UserId == B), but the row already
        // exists server-side under A's ownership.
        Authorize(client, tokenB);
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            classes: [classRow with { UserId = userIdB }]));

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
        await client.PostAsJsonAsync("/sync/push", NewBatch(classes: [classRow]));

        Authorize(client, tokenB);
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(subjects: [NewSubject(classRow.Id)]));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Push_rejects_a_review_flag_referencing_a_lesson_not_owned_by_the_caller()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-review-flag-owner-a");
        var (tokenB, userIdB) = await LoginAsync(client, "sub-review-flag-owner-b");

        Authorize(client, tokenA);
        var classA = NewClass(userIdA);
        var subjectA = NewSubject(classA.Id);
        var lessonA = NewLesson(subjectA.Id);
        var studentA = NewStudent(classA.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(
            classes: [classA], subjects: [subjectA], lessons: [lessonA], students: [studentA]));

        // B has no relationship to A's lesson or student at all.
        Authorize(client, tokenB);
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            reviewFlags: [NewReviewFlag(studentA.Id, lessonA.Id)]));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Push_merges_progress_step_by_hlc()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-progress-merge");
        Authorize(client, token);

        var classRow = NewClass(userId);
        var subjectRow = NewSubject(classRow.Id);
        var studentRow = NewStudent(classRow.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(classes: [classRow], subjects: [subjectRow], students: [studentRow]));

        var firstDeviceRow = NewProgress(studentRow.Id, subjectRow.Id, stepUnit: 1, stepHlc: "hlc-1");
        var firstResponse = await client.PostAsJsonAsync("/sync/push", NewBatch(progress: [firstDeviceRow]));
        var firstBody = await firstResponse.Content.ReadFromJsonAsync<SyncBatch>();
        var canonicalId = Assert.Single(firstBody!.Progress).Id;

        // A second device, never having synced with the first, independently
        // created its own row (different id) for the same (student, subject)
        // cell, with an older step -- it should lose the merge.
        var secondDeviceRow = NewProgress(studentRow.Id, subjectRow.Id, stepUnit: 99, stepHlc: "hlc-0");
        var secondResponse = await client.PostAsJsonAsync("/sync/push", NewBatch(progress: [secondDeviceRow]));

        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        var secondBody = await secondResponse.Content.ReadFromJsonAsync<SyncBatch>();
        var merged = Assert.Single(secondBody!.Progress);

        Assert.Equal(canonicalId, merged.Id);
        Assert.Equal(1, merged.StepUnit);
        Assert.Equal("hlc-1", merged.StepHlc);
    }

    // #152/ADR-0011: review_flag gets the same per-field HLC+client-id LWW
    // merge Progress.Step already has, just against its own
    // (student_id, lesson_id) pair. These three cases mirror
    // Push_merges_progress_step_by_hlc's shape: the incumbent (server-side)
    // row winning, the incoming (pushed) row winning, and an exact-HLC tie
    // resolved by client_id.

    [Fact]
    public async Task Push_review_flag_merge_same_side_wins_when_the_incumbents_hlc_is_newer()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-review-flag-same-side");
        Authorize(client, token);

        var classRow = NewClass(userId);
        var subjectRow = NewSubject(classRow.Id);
        var lessonRow = NewLesson(subjectRow.Id);
        var studentRow = NewStudent(classRow.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(
            classes: [classRow], subjects: [subjectRow], lessons: [lessonRow], students: [studentRow]));

        var incumbent = NewReviewFlag(studentRow.Id, lessonRow.Id, flagged: true, hlc: "hlc-9");
        var createResponse = await client.PostAsJsonAsync("/sync/push", NewBatch(reviewFlags: [incumbent]));
        var createBody = await createResponse.Content.ReadFromJsonAsync<SyncBatch>();
        var canonicalId = Assert.Single(createBody!.ReviewFlags).Id;

        // A challenger with an older hlc pushes for the same (student, lesson)
        // pair under a different id -- the incumbent's value must survive.
        var challenger = NewReviewFlag(studentRow.Id, lessonRow.Id, flagged: false, hlc: "hlc-1");
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(reviewFlags: [challenger]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SyncBatch>();
        var merged = Assert.Single(body!.ReviewFlags);

        Assert.Equal(canonicalId, merged.Id);
        Assert.True(merged.Flagged);
        Assert.Equal("hlc-9", merged.Hlc);
    }

    [Fact]
    public async Task Push_review_flag_merge_other_side_wins_when_the_incoming_hlc_is_newer()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-review-flag-other-side");
        Authorize(client, token);

        var classRow = NewClass(userId);
        var subjectRow = NewSubject(classRow.Id);
        var lessonRow = NewLesson(subjectRow.Id);
        var studentRow = NewStudent(classRow.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(
            classes: [classRow], subjects: [subjectRow], lessons: [lessonRow], students: [studentRow]));

        var incumbent = NewReviewFlag(studentRow.Id, lessonRow.Id, flagged: false, hlc: "hlc-1");
        var createResponse = await client.PostAsJsonAsync("/sync/push", NewBatch(reviewFlags: [incumbent]));
        var createBody = await createResponse.Content.ReadFromJsonAsync<SyncBatch>();
        var canonicalId = Assert.Single(createBody!.ReviewFlags).Id;

        // A challenger with a newer hlc pushes for the same pair under a
        // different id -- it should win and become the canonical value.
        var challenger = NewReviewFlag(studentRow.Id, lessonRow.Id, flagged: true, hlc: "hlc-9");
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(reviewFlags: [challenger]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SyncBatch>();
        var merged = Assert.Single(body!.ReviewFlags);

        Assert.Equal(canonicalId, merged.Id);
        Assert.True(merged.Flagged);
        Assert.Equal("hlc-9", merged.Hlc);
    }

    [Fact]
    public async Task Push_review_flag_merge_tie_breaks_by_client_id_when_hlcs_are_equal()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-review-flag-tie-break");
        Authorize(client, token);

        var classRow = NewClass(userId);
        var subjectRow = NewSubject(classRow.Id);
        var lessonRow = NewLesson(subjectRow.Id);
        var studentRow = NewStudent(classRow.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(
            classes: [classRow], subjects: [subjectRow], lessons: [lessonRow], students: [studentRow]));

        var lowClientId = new Guid("00000000-0000-0000-0000-000000000001");
        var highClientId = new Guid("ffffffff-ffff-ffff-ffff-ffffffffffff");

        var incumbent = NewReviewFlag(
            studentRow.Id, lessonRow.Id, flagged: false, hlc: "hlc-1", clientId: lowClientId);
        var createResponse = await client.PostAsJsonAsync("/sync/push", NewBatch(reviewFlags: [incumbent]));
        var createBody = await createResponse.Content.ReadFromJsonAsync<SyncBatch>();
        var canonicalId = Assert.Single(createBody!.ReviewFlags).Id;

        // Same hlc as the incumbent -- the higher client_id must win the tie.
        var challenger = NewReviewFlag(
            studentRow.Id, lessonRow.Id, flagged: true, hlc: "hlc-1", clientId: highClientId);
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(reviewFlags: [challenger]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SyncBatch>();
        var merged = Assert.Single(body!.ReviewFlags);

        Assert.Equal(canonicalId, merged.Id);
        Assert.True(merged.Flagged);
        Assert.Equal(highClientId, merged.ClientId);
    }

    [Fact]
    public async Task Pull_returns_only_the_authenticated_users_own_rows()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-pull-scope-a");
        var (tokenB, userIdB) = await LoginAsync(client, "sub-pull-scope-b");

        Authorize(client, tokenA);
        var classA = NewClass(userIdA, name: "A's class");
        await client.PostAsJsonAsync("/sync/push", NewBatch(classes: [classA]));

        Authorize(client, tokenB);
        var classB = NewClass(userIdB, name: "B's class");
        await client.PostAsJsonAsync("/sync/push", NewBatch(classes: [classB]));

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
        await client.PostAsJsonAsync("/sync/push", NewBatch(classes: [firstClass]));

        var firstPull = await client.GetAsync("/sync/pull");
        var firstPullBody = await firstPull.Content.ReadFromJsonAsync<SyncPullResponse>();
        Assert.Contains(firstPullBody!.Classes, c => c.Id == firstClass.Id);

        var secondClass = NewClass(userId, name: "Second");
        await client.PostAsJsonAsync("/sync/push", NewBatch(classes: [secondClass]));

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
        var reviewFlagRow = NewReviewFlag(studentRow.Id, lessonRow.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(
            classes: [classRow], subjects: [subjectRow], lessons: [lessonRow], students: [studentRow],
            progress: [progressRow], reviewFlags: [reviewFlagRow]));

        var response = await client.GetAsync("/sync/pull");
        var body = await response.Content.ReadFromJsonAsync<SyncPullResponse>();

        Assert.Contains(body!.Classes, c => c.Id == classRow.Id);
        Assert.Contains(body.Subjects, s => s.Id == subjectRow.Id);
        Assert.Contains(body.Students, s => s.Id == studentRow.Id);
        Assert.Contains(body.Lessons, l => l.Id == lessonRow.Id);
        Assert.Contains(body.Progress, p => p.Id == progressRow.Id);
        Assert.Contains(body.ReviewFlags, r => r.Id == reviewFlagRow.Id);
    }

    // #168: Class Templates are a three-level ownership chain rooted at their
    // own user_id (not a class) -- class_template -> class_template_subject
    // -> class_template_lesson. Mirrors the class/subject/lesson coverage
    // above, one level deeper.
    [Fact]
    public async Task Push_creates_a_class_template_and_its_subject_and_lesson_in_the_same_batch()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-template-push-create");
        Authorize(client, token);

        var templateRow = NewClassTemplate(userId, name: "Fall Curriculum");
        var templateSubjectRow = NewClassTemplateSubject(templateRow.Id, name: "Math");
        var templateLessonRow = NewClassTemplateLesson(templateSubjectRow.Id, unit: 1, lessonInUnit: 1);

        // All three levels -- parent, child, and grandchild -- arrive in one
        // push batch, so the handler must add each same-batch-created parent's
        // id to the ownership set before validating rows that reference it,
        // rather than requiring a prior round trip to establish ownership.
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            classTemplates: [templateRow],
            classTemplateSubjects: [templateSubjectRow],
            classTemplateLessons: [templateLessonRow]));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SyncBatch>();

        var echoedTemplate = Assert.Single(body!.ClassTemplates);
        Assert.Equal(templateRow.Id, echoedTemplate.Id);
        Assert.Equal("Fall Curriculum", echoedTemplate.Name);
        Assert.Equal(userId, echoedTemplate.UserId);

        var echoedSubject = Assert.Single(body.ClassTemplateSubjects);
        Assert.Equal(templateSubjectRow.Id, echoedSubject.Id);
        Assert.Equal(templateRow.Id, echoedSubject.ClassTemplateId);

        var echoedLesson = Assert.Single(body.ClassTemplateLessons);
        Assert.Equal(templateLessonRow.Id, echoedLesson.Id);
        Assert.Equal(templateSubjectRow.Id, echoedLesson.ClassTemplateSubjectId);
    }

    [Fact]
    public async Task Push_rejects_a_class_template_claimed_for_another_user()
    {
        using var client = fixture.CreateClient();
        var (tokenA, _) = await LoginAsync(client, "sub-template-claim-a");
        var (_, userIdB) = await LoginAsync(client, "sub-template-claim-b");
        Authorize(client, tokenA);

        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            classTemplates: [NewClassTemplate(userIdB)]));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Push_rejects_a_class_template_subject_referencing_a_template_not_owned_by_the_caller()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-template-subject-a");
        var (tokenB, _) = await LoginAsync(client, "sub-template-subject-b");

        Authorize(client, tokenA);
        var templateRow = NewClassTemplate(userIdA);
        await client.PostAsJsonAsync("/sync/push", NewBatch(classTemplates: [templateRow]));

        Authorize(client, tokenB);
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            classTemplateSubjects: [NewClassTemplateSubject(templateRow.Id)]));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Push_rejects_a_class_template_lesson_referencing_a_subject_not_owned_by_the_caller()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-template-lesson-a");
        var (tokenB, _) = await LoginAsync(client, "sub-template-lesson-b");

        Authorize(client, tokenA);
        var templateRow = NewClassTemplate(userIdA);
        var templateSubjectRow = NewClassTemplateSubject(templateRow.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(
            classTemplates: [templateRow], classTemplateSubjects: [templateSubjectRow]));

        Authorize(client, tokenB);
        var response = await client.PostAsJsonAsync("/sync/push", NewBatch(
            classTemplateLessons: [NewClassTemplateLesson(templateSubjectRow.Id)]));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Pull_returns_only_the_authenticated_users_own_class_templates()
    {
        using var client = fixture.CreateClient();
        var (tokenA, userIdA) = await LoginAsync(client, "sub-template-pull-scope-a");
        var (tokenB, userIdB) = await LoginAsync(client, "sub-template-pull-scope-b");

        Authorize(client, tokenA);
        var templateA = NewClassTemplate(userIdA, name: "A's template");
        await client.PostAsJsonAsync("/sync/push", NewBatch(classTemplates: [templateA]));

        Authorize(client, tokenB);
        var templateB = NewClassTemplate(userIdB, name: "B's template");
        await client.PostAsJsonAsync("/sync/push", NewBatch(classTemplates: [templateB]));

        var pullResponse = await client.GetAsync("/sync/pull");
        var pullBody = await pullResponse.Content.ReadFromJsonAsync<SyncPullResponse>();

        Assert.Contains(pullBody!.ClassTemplates, ct => ct.Id == templateB.Id);
        Assert.DoesNotContain(pullBody.ClassTemplates, ct => ct.Id == templateA.Id);
    }

    [Fact]
    public async Task Pull_with_no_since_returns_the_full_class_template_snapshot()
    {
        using var client = fixture.CreateClient();
        var (token, userId) = await LoginAsync(client, "sub-template-pull-snapshot");
        Authorize(client, token);

        var templateRow = NewClassTemplate(userId);
        var templateSubjectRow = NewClassTemplateSubject(templateRow.Id);
        var templateLessonRow = NewClassTemplateLesson(templateSubjectRow.Id);
        await client.PostAsJsonAsync("/sync/push", NewBatch(
            classTemplates: [templateRow],
            classTemplateSubjects: [templateSubjectRow],
            classTemplateLessons: [templateLessonRow]));

        var response = await client.GetAsync("/sync/pull");
        var body = await response.Content.ReadFromJsonAsync<SyncPullResponse>();

        Assert.Contains(body!.ClassTemplates, ct => ct.Id == templateRow.Id);
        Assert.Contains(body.ClassTemplateSubjects, cts => cts.Id == templateSubjectRow.Id);
        Assert.Contains(body.ClassTemplateLessons, ctl => ctl.Id == templateLessonRow.Id);
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

    private static SyncBatch NewBatch(
        List<ClassSyncRow>? classes = null,
        List<SubjectSyncRow>? subjects = null,
        List<LessonSyncRow>? lessons = null,
        List<StudentSyncRow>? students = null,
        List<ProgressSyncRow>? progress = null,
        List<ReviewFlagSyncRow>? reviewFlags = null,
        List<SubjectTemplateSyncRow>? subjectTemplates = null,
        List<SubjectTemplateLessonSyncRow>? subjectTemplateLessons = null,
        List<ClassTemplateSyncRow>? classTemplates = null,
        List<ClassTemplateSubjectSyncRow>? classTemplateSubjects = null,
        List<ClassTemplateLessonSyncRow>? classTemplateLessons = null) =>
        new(
            classes ?? [],
            subjects ?? [],
            lessons ?? [],
            students ?? [],
            progress ?? [],
            reviewFlags ?? [],
            subjectTemplates ?? [],
            subjectTemplateLessons ?? [],
            classTemplates ?? [],
            classTemplateSubjects ?? [],
            classTemplateLessons ?? []);

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
        string stepHlc = "hlc-1") =>
        new(id ?? Guid.NewGuid(), studentId, subjectId, stepUnit, stepLessonInUnit, stepHlc, Guid.NewGuid(), DateTimeOffset.UtcNow);

    private static ReviewFlagSyncRow NewReviewFlag(
        Guid studentId,
        Guid lessonId,
        Guid? id = null,
        bool flagged = true,
        string hlc = "hlc-1",
        Guid? clientId = null) =>
        new(id ?? Guid.NewGuid(), studentId, lessonId, flagged, hlc, clientId ?? Guid.NewGuid(), DateTimeOffset.UtcNow);

    private static SubjectTemplateSyncRow NewSubjectTemplate(Guid userId, Guid? id = null, string name = "Math Template") =>
        new(id ?? Guid.NewGuid(), userId, name, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);

    private static SubjectTemplateLessonSyncRow NewSubjectTemplateLesson(
        Guid subjectTemplateId, Guid? id = null, int unit = 1, int lessonInUnit = 1) =>
        new(id ?? Guid.NewGuid(), subjectTemplateId, unit, lessonInUnit, "Fractions", "Intro to fractions",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);

    private static ClassTemplateSyncRow NewClassTemplate(Guid userId, Guid? id = null, string name = "Fall Curriculum") =>
        new(id ?? Guid.NewGuid(), userId, name, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);

    private static ClassTemplateSubjectSyncRow NewClassTemplateSubject(
        Guid classTemplateId, Guid? id = null, string name = "Math", int position = 0) =>
        new(id ?? Guid.NewGuid(), classTemplateId, name, position, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);

    private static ClassTemplateLessonSyncRow NewClassTemplateLesson(
        Guid classTemplateSubjectId, Guid? id = null, int unit = 1, int lessonInUnit = 1) =>
        new(id ?? Guid.NewGuid(), classTemplateSubjectId, unit, lessonInUnit, "Fractions", "Intro to fractions",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);
}
