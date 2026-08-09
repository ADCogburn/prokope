namespace server.AiBulkGeneration;

// App-wide monthly cap (#215, ADR-0020). Deliberately separate from
// IDailyGenerationRateLimiter (#214) rather than one combined interface --
// the two are independent limits with different storage (in-memory vs
// persisted), different keys (per-teacher vs app-wide), and must never
// share state, so keeping them as distinct seams makes "these two can't
// cross-contaminate" true by construction rather than by care.
public interface IMonthlyGenerationRateLimiter
{
    // The configured cap itself, exposed so the endpoint can build a
    // specific "reached its limit" message without duplicating the
    // configuration read (mirrors IDailyGenerationRateLimiter.DailyLimit).
    int MonthlyLimit { get; }

    // Records one generation attempt against the current calendar month's
    // total and reports whether it's allowed to proceed. Returns false,
    // without recording anything, once the app-wide monthly cap has already
    // been reached -- a blocked attempt never consumes a slot.
    Task<bool> TryRecordAttemptAsync(CancellationToken cancellationToken = default);
}
