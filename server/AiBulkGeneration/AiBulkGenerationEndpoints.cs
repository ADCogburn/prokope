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
//
// #221/ADR-0020: every attempt that reaches the client below -- generated,
// not-found, failed, or timed-out -- gets a structured log entry (teacher
// id, timestamp, token usage) for cost visibility. A log line only, not a
// new table -- ILoggerFactory.CreateLogger, not ILogger<AiBulkGenerationEndpoints>,
// since this is a static class and can't be used as a generic type argument.
public static class AiBulkGenerationEndpoints
{
    public static void MapAiBulkGenerationEndpoints(this WebApplication app)
    {
        app.MapPost("/ai-bulk-generation", async (
            AiBulkGenerationRequest request,
            IAnthropicCurriculumClient client,
            IDailyGenerationRateLimiter dailyRateLimiter,
            IMonthlyGenerationRateLimiter monthlyRateLimiter,
            ILoggerFactory loggerFactory,
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

            // #215: independent from the daily check above -- separate
            // storage, separate key (app-wide, not per-teacher) -- so
            // exhausting one never consumes or affects the other's count.
            if (!await monthlyRateLimiter.TryRecordAttemptAsync(cancellationToken))
            {
                return Results.Problem(
                    detail: "AI Bulk Generation has reached its limit for this month — try again next month.",
                    statusCode: StatusCodes.Status429TooManyRequests);
            }

            var result = await client.GenerateAsync(request.CurriculumName, cancellationToken);

            // #221: logged for every outcome above -- generated, not-found,
            // failed, or timed-out -- since all four mean this attempt
            // actually reached Anthropic. TokenUsage is null (logged as
            // absent) when the failure happened before any response came
            // back, e.g. a network error or a call that timed out with no
            // prior call in the same attempt to attach usage from.
            var logger = loggerFactory.CreateLogger("AiBulkGeneration");
            logger.LogInformation(
                "AI Bulk Generation attempt reached Anthropic: teacher={TeacherId} at={Timestamp:o} outcome={Outcome} inputTokens={InputTokens} outputTokens={OutputTokens}",
                teacherId.Value,
                DateTimeOffset.UtcNow,
                result.Status,
                result.TokenUsage?.InputTokens,
                result.TokenUsage?.OutputTokens);

            return result.Status switch
            {
                CurriculumGenerationStatus.Generated => Results.Ok(
                    new AiBulkGenerationResponse(result.Lessons!.Select(ToDto).ToList())),

                CurriculumGenerationStatus.NotFound => Results.NotFound(
                    new AiBulkGenerationNotFoundResponse(
                        request.CurriculumName,
                        $"Couldn't find a public curriculum matching \"{request.CurriculumName}\".")),

                // #218: distinct from the generic failure below so a client
                // can tell "took too long, maybe try again" apart from
                // "something broke".
                CurriculumGenerationStatus.TimedOut => Results.Problem(
                    detail: "AI curriculum generation timed out. Please try again.",
                    statusCode: StatusCodes.Status504GatewayTimeout),

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
