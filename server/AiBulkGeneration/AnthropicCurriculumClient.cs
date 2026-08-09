using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Anthropic;
using Anthropic.Helpers;
using Anthropic.Models.Messages;

namespace server.AiBulkGeneration;

// Real Anthropic-backed implementation of IAnthropicCurriculumClient
// (ADR-0018), replacing the #197 placeholder. Two sequential Messages API
// calls, never one:
//
//   1. Search + gather: curriculum name in, web_search_20260318 enabled
//      (capped at max_uses: 8), no structured-output format -- free-text
//      notes with citations. The prompt requires the model to say plainly
//      when it couldn't find usable public source material, via a sentinel
//      token this class checks for verbatim (see NotFoundSentinel).
//   2. Extract + constrain: no tools, output_config.format set to a
//      json_schema for the lesson list, fed call 1's notes as context.
//
// If call 1 signals "not found", call 2 never runs -- returning early here
// is what stops a schema-valid but fabricated lesson list from ever being
// generated for a curriculum that doesn't exist. If call 2's structured
// output fails to parse against the expected shape, it is retried exactly
// once, reusing call 1's existing notes (no re-search, no re-paying for web
// search); a second failure surfaces as the Failed outcome.
//
// Per #198's spec, the internal two-call/retry flow has no dedicated unit
// tests -- the endpoint-level stub-driven tests (#197,
// AiBulkGenerationEndpointsTests) already cover all three outcomes by
// substituting StubAnthropicCurriculumClient in DI, and there's no repo
// precedent for testing an internal-only retry loop.
public class AnthropicCurriculumClient(
    IAnthropicClient anthropicClient,
    string model,
    TimeSpan searchTimeout,
    TimeSpan extractTimeout) : IAnthropicCurriculumClient
{
    // Distinctive token the call-1 prompt requires the model to emit,
    // verbatim and alone, when it finds no usable public source material for
    // the given curriculum name. Checked as a raw substring of the
    // free-text notes rather than parsed as structured output, since call 1
    // deliberately carries no output_config.format -- constraining it would
    // give the model a schema to fill in even when it has nothing to report.
    private const string NotFoundSentinel = "NO_USABLE_SOURCE_FOUND";

    // Generous ceilings for the two call shapes: call 1 is prose research
    // notes with citations, call 2 is a JSON lesson list that can run long
    // for a curriculum with many units. Neither call streams -- both are
    // comfortably under the ~16K non-streaming guidance for this SDK.
    private const long SearchMaxTokens = 4096;
    private const long ExtractMaxTokens = 8192;

    public async Task<CurriculumGenerationResult> GenerateAsync(string curriculumName, CancellationToken cancellationToken = default)
    {
        string notes;
        TokenUsage searchUsage;
        try
        {
            (notes, searchUsage) = await SearchAndGatherAsync(curriculumName, cancellationToken);
        }
        catch (CallTimeoutException)
        {
            // No response ever came back, so no usage to attach.
            return CurriculumGenerationResult.TimedOut;
        }
        catch (Exception)
        {
            // Network/API failure on call 1 -- nothing to short-circuit on,
            // nothing to extract, and (same as the timeout above) no usage:
            // this failed before any response was returned. Surface as a
            // generic failure rather than NotFound, which is reserved for
            // the model's own "couldn't find it" signal.
            return CurriculumGenerationResult.Failed;
        }

        if (notes.Contains(NotFoundSentinel, StringComparison.Ordinal))
        {
            // Call 2 must never run against notes that say nothing was
            // found -- that's exactly the fabricated-lesson-list failure
            // mode #198 exists to prevent.
            return CurriculumGenerationResult.NotFound with { TokenUsage = searchUsage };
        }

        IReadOnlyList<GeneratedLesson>? lessons;
        TokenUsage extractUsage;
        try
        {
            (lessons, extractUsage) = await ExtractAndConstrainAsync(notes, cancellationToken);
        }
        catch (CallTimeoutException)
        {
            // Call 1's usage is still real spend even though call 2 never
            // finished -- attach what we have rather than discarding it.
            return CurriculumGenerationResult.TimedOut with { TokenUsage = searchUsage };
        }

        var totalUsage = searchUsage + extractUsage;
        return lessons is null
            ? CurriculumGenerationResult.Failed with { TokenUsage = totalUsage }
            : CurriculumGenerationResult.Generated(lessons, totalUsage);
    }

    // Call 1: search + gather. Web search enabled, capped at 8 uses, no
    // structured-output format -- free text so the model can explain what
    // it found (or didn't) in its own words, with citations.
    private async Task<(string Notes, TokenUsage Usage)> SearchAndGatherAsync(string curriculumName, CancellationToken cancellationToken)
    {
        var response = await CreateWithTimeoutAsync(
            new MessageCreateParams
            {
                Model = model,
                MaxTokens = SearchMaxTokens,
                Tools = [new WebSearchTool20260318 { MaxUses = 8 }],
                Messages =
                [
                    new MessageParam
                    {
                        Role = "user",
                        Content = $"""
                            You are researching a curriculum for a K-12 lesson-planning tool. Use web search to
                            find publicly available information about a real curriculum named "{curriculumName}"
                            (e.g. a published scope-and-sequence, textbook table of contents, or official course
                            outline).

                            If, after searching, you cannot find any usable public source material describing a
                            real curriculum with this name, respond with exactly this line and nothing else:
                            {NotFoundSentinel}

                            Otherwise, write detailed free-text research notes summarizing the curriculum's
                            structure -- its units, and for each unit the lessons within it, in order -- with
                            enough detail (lesson titles, what each lesson covers, unit groupings) that another
                            pass can turn these notes into a structured lesson list without doing any further
                            research. Cite the sources you drew from.
                            """,
                    },
                ],
            },
            searchTimeout,
            cancellationToken);

        return (ExtractText(response), ToTokenUsage(response.Usage));
    }

    // Call 2: extract + constrain. No tools; output_config.format
    // constrains the response to the lesson-list JSON schema. Retries once
    // on a schema-validation failure, reusing the same notes (no re-search).
    // Usage accumulates across both attempts when a retry happens -- both
    // are real spend against the same generation attempt.
    private async Task<(IReadOnlyList<GeneratedLesson>? Lessons, TokenUsage Usage)> ExtractAndConstrainAsync(
        string notes, CancellationToken cancellationToken)
    {
        const int maxAttempts = 2;
        var usage = new TokenUsage(0, 0);
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            var response = await CreateWithTimeoutAsync(
                new MessageCreateParams
                {
                    Model = model,
                    MaxTokens = ExtractMaxTokens,
                    OutputConfig = new OutputConfig
                    {
                        Format = StructuredOutput.CreateJsonFormat<LessonListPayload>(),
                    },
                    Messages =
                    [
                        new MessageParam
                        {
                            Role = "user",
                            Content = $"""
                                Using only the research notes below, extract a structured lesson list: every
                                lesson, grouped by unit, in the order the notes describe them. `unit` and
                                `lesson_in_unit` are both 1-based -- `lesson_in_unit` restarts at 1 for each new
                                unit. Units may contain different numbers of lessons.

                                Research notes:
                                {notes}
                                """,
                        },
                    ],
                },
                extractTimeout,
                cancellationToken);
            usage += ToTokenUsage(response.Usage);

            var json = ExtractText(response);
            try
            {
                var payload = StructuredOutput.Parse<LessonListPayload>(json);
                if (payload.Lessons.Count == 0)
                {
                    // Schema-valid but empty is not a usable result --
                    // treat it the same as a validation failure and retry.
                    continue;
                }

                var lessons = payload.Lessons
                    .Select(lesson => new GeneratedLesson(lesson.Unit, lesson.LessonInUnit, lesson.Title, lesson.Description))
                    .ToList();
                return (lessons, usage);
            }
            catch (JsonException) when (attempt < maxAttempts)
            {
                // Schema-validation failure -- retry exactly once, reusing
                // the notes already gathered in call 1.
            }
        }

        return (null, usage);
    }

    private static TokenUsage ToTokenUsage(Usage usage) => new(usage.InputTokens, usage.OutputTokens);

    private static string ExtractText(Message response)
    {
        var builder = new StringBuilder();
        foreach (var block in response.Content)
        {
            if (block.TryPickText(out var textBlock))
            {
                builder.Append(textBlock.Text);
            }
        }

        return builder.ToString();
    }

    // #218: bounds a single Messages.Create call with an explicit deadline,
    // via a linked token so the caller's own cancellationToken (a teacher
    // navigating away or closing the tab -- already threaded through both
    // calls before this ticket) keeps working exactly as it did before.
    // Distinguishes which token fired by checking cancellationToken's own
    // state after the fact: if it's still unset, the linked source's
    // CancelAfter is what tripped, so this is a timeout, not a
    // caller-initiated cancellation -- surfaced as CallTimeoutException so
    // GenerateAsync can map it to the TimedOut outcome specifically, rather
    // than the generic Failed a caught OperationCanceledException would
    // otherwise fall into.
    private async Task<Message> CreateWithTimeoutAsync(
        MessageCreateParams parameters, TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        linkedCts.CancelAfter(timeout);

        try
        {
            return await anthropicClient.Messages.Create(parameters, linkedCts.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new CallTimeoutException();
        }
    }

    // Internal-only signal from CreateWithTimeoutAsync to GenerateAsync;
    // never crosses this class's boundary.
    private sealed class CallTimeoutException : Exception;

    // Wire shape for call 2's structured output only -- deliberately
    // separate from both GeneratedLesson (the domain type this class
    // returns) and GeneratedLessonDto (the HTTP contract), so a schema
    // change here never leaks into either. Property names are the
    // json_schema field names the model fills in, per #198's spec: unit,
    // lesson_in_unit, title, description, variable count per unit.
    // Deliberately not `required` -- StructuredOutput.Parse<T> constrains T
    // to `new()`, which a type with required members cannot satisfy.
    // Schema-level "required" is still enforced server-side by
    // output_config.format; a response that omits a field fails
    // deserialization into non-nullable int/string properties either way.
    private sealed class LessonListPayload
    {
        [JsonPropertyName("lessons")]
        public List<LessonPayload> Lessons { get; init; } = [];
    }

    private sealed class LessonPayload
    {
        [JsonPropertyName("unit")]
        public int Unit { get; init; }

        [JsonPropertyName("lesson_in_unit")]
        public int LessonInUnit { get; init; }

        [JsonPropertyName("title")]
        public string Title { get; init; } = "";

        [JsonPropertyName("description")]
        public string Description { get; init; } = "";
    }
}
