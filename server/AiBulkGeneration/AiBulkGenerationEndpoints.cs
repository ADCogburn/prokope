using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace server.AiBulkGeneration;

// Implements #197: a stateless endpoint that turns a curriculum name into a
// proposed lesson list via IAnthropicCurriculumClient, with a distinct HTTP
// response shape per outcome so a future client (#144) can tell "couldn't
// find this curriculum" apart from "something broke". Never touches the
// database -- see #192's "Endpoint statelessness" decision -- and requires
// authorization like every other per-user feature endpoint in this app
// (SyncEndpoints), since a generation call has real Anthropic API cost.
//
// #214 adds this endpoint's first notion of "the authenticated teacher": the
// JWT `sub` claim, read the same way SyncEndpoints already does, used only
// to key the daily rate limit below (not persisted or otherwise used yet).
public static class AiBulkGenerationEndpoints
{
    public static void MapAiBulkGenerationEndpoints(this WebApplication app)
    {
        app.MapPost("/ai-bulk-generation", async (
            AiBulkGenerationRequest request,
            IAnthropicCurriculumClient client,
            IDailyGenerationRateLimiter dailyRateLimiter,
            ClaimsPrincipal principal,
            CancellationToken cancellationToken) =>
        {
            var teacherId = GetTeacherId(principal);
            if (teacherId is null)
            {
                return Results.Unauthorized();
            }

            // Checked, and counted, before the Anthropic call: a blocked
            // attempt must never reach the client below, and every attempt
            // that does reach it -- generated, not-found, or failed -- counts
            // against the cap.
            if (!dailyRateLimiter.TryRecordAttempt(teacherId.Value))
            {
                return Results.Problem(
                    detail: $"You've used all {dailyRateLimiter.DailyLimit} AI generations for today — try again tomorrow.",
                    statusCode: StatusCodes.Status429TooManyRequests);
            }

            var result = await client.GenerateAsync(request.CurriculumName, cancellationToken);

            return result.Status switch
            {
                CurriculumGenerationStatus.Generated => Results.Ok(
                    new AiBulkGenerationResponse(result.Lessons!.Select(ToDto).ToList())),

                CurriculumGenerationStatus.NotFound => Results.NotFound(
                    new AiBulkGenerationNotFoundResponse(
                        request.CurriculumName,
                        $"Couldn't find a public curriculum matching \"{request.CurriculumName}\".")),

                _ => Results.Problem(
                    detail: "AI curriculum generation failed. Please try again.",
                    statusCode: StatusCodes.Status502BadGateway),
            };
        })
        .WithName("AiBulkGeneration")
        .RequireAuthorization();
    }

    private static GeneratedLessonDto ToDto(GeneratedLesson lesson) =>
        new(lesson.Unit, lesson.LessonInUnit, lesson.Title, lesson.Description);

    private static Guid? GetTeacherId(ClaimsPrincipal principal)
    {
        var subject = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return subject is not null && Guid.TryParse(subject, out var teacherId) ? teacherId : null;
    }
}
