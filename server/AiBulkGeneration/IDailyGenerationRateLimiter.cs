namespace server.AiBulkGeneration;

// Per-teacher daily cap (#214, ADR-0020). Kept behind an interface -- even
// though today there's exactly one implementation -- so the endpoint's
// rate-limit check is a seam #215 (the monthly cap) and #221 (usage
// logging) can plug into without touching AiBulkGenerationEndpoints.cs
// again, mirroring IAnthropicCurriculumClient's role for the generation
// call itself.
public interface IDailyGenerationRateLimiter
{
    // The configured cap itself, exposed so the endpoint can build a
    // specific "you've used all N" message without duplicating the
    // configuration read.
    int DailyLimit { get; }

    // Records one generation attempt for teacherId and reports whether it's
    // allowed to proceed. Returns false, without recording anything, once
    // the teacher has already reached the daily cap -- a blocked attempt
    // never consumes a slot, so it can't itself push a later attempt over
    // the limit.
    bool TryRecordAttempt(Guid teacherId);
}
