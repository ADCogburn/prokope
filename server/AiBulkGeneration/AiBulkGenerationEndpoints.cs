namespace server.AiBulkGeneration;

// Implements #197: a stateless endpoint that turns a curriculum name into a
// proposed lesson list via IAnthropicCurriculumClient, with a distinct HTTP
// response shape per outcome so a future client (#144) can tell "couldn't
// find this curriculum" apart from "something broke". Never touches the
// database -- see #192's "Endpoint statelessness" decision -- and requires
// authorization like every other per-user feature endpoint in this app
// (SyncEndpoints), since a generation call has real Anthropic API cost.
public static class AiBulkGenerationEndpoints
{
    public static void MapAiBulkGenerationEndpoints(this WebApplication app)
    {
        app.MapPost("/ai-bulk-generation", async (
            AiBulkGenerationRequest request,
            IAnthropicCurriculumClient client,
            CancellationToken cancellationToken) =>
        {
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
}
