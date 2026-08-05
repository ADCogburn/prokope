using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using server.Auth;
using server.Data;

namespace server.Tests;

// Exercises POST /auth/demo (#32): a Google-verification-free login that
// provisions an isolated Demo Account and its seeded sample Class, using the
// same session-token/response shape as /auth/google.
public class DemoAuthEndpointsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task Demo_login_creates_an_isolated_demo_user()
    {
        using var client = fixture.CreateClient();

        var response = await client.PostAsync("/auth/demo", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrWhiteSpace(body!.Token));
        Assert.NotEqual(Guid.Empty, body.UserId);
        Assert.True(body.IsDemo);
    }

    [Fact]
    public async Task Each_demo_login_gets_its_own_user_and_class()
    {
        using var client = fixture.CreateClient();

        var first = await client.PostAsync("/auth/demo", null);
        var second = await client.PostAsync("/auth/demo", null);

        var firstBody = await first.Content.ReadFromJsonAsync<AuthResponse>();
        var secondBody = await second.Content.ReadFromJsonAsync<AuthResponse>();

        Assert.NotEqual(firstBody!.UserId, secondBody!.UserId);
    }

    [Fact]
    public async Task Demo_login_seeds_a_sample_class_with_students_subjects_lessons_and_progress()
    {
        using var client = fixture.CreateClient();
        var response = await client.PostAsync("/auth/demo", null);
        var body = await response.Content.ReadFromJsonAsync<AuthResponse>();

        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var user = await db.Users.SingleAsync(u => u.Id == body!.UserId);
        Assert.True(user.IsDemo);
        Assert.Null(user.GoogleSub);

        var classRow = await db.Classes.SingleAsync(c => c.UserId == user.Id);
        var subjects = await db.Subjects.Where(s => s.ClassId == classRow.Id).ToListAsync();
        var students = await db.Students.Where(s => s.ClassId == classRow.Id).ToListAsync();
        Assert.True(subjects.Count >= 2);
        Assert.True(students.Count >= 2);

        var subjectIds = subjects.Select(s => s.Id).ToHashSet();
        var lessons = await db.Lessons.Where(l => subjectIds.Contains(l.SubjectId)).ToListAsync();
        var progress = await db.Progress.Where(p => subjectIds.Contains(p.SubjectId)).ToListAsync();
        Assert.NotEmpty(lessons);
        Assert.NotEmpty(progress);
        Assert.Contains(progress, p => p.Review);
    }

    [Fact]
    public async Task Demo_login_issues_a_token_that_works_against_auth_me()
    {
        using var client = fixture.CreateClient();
        var login = await client.PostAsync("/auth/demo", null);
        var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginBody!.Token);
        var response = await client.GetAsync("/auth/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var meBody = await response.Content.ReadFromJsonAsync<MeResponse>();
        Assert.Equal(loginBody.UserId, meBody!.UserId);
        Assert.True(meBody.IsDemo);
    }
}

// Separate fixture (its own container) so the disabled-flag path can be
// asserted without turning the flag off for every other test in this suite.
public class DemoAuthDisabledTests(DemoAccountDisabledDatabaseFixture fixture)
    : IClassFixture<DemoAccountDisabledDatabaseFixture>
{
    [Fact]
    public async Task Demo_login_fails_gracefully_when_disabled()
    {
        using var client = fixture.CreateClient();

        var response = await client.PostAsync("/auth/demo", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
