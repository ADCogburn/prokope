namespace server.Data.Entities;

// #215/ADR-0020: one row per calendar month, incremented atomically via
// ExecuteUpdateAsync (see PersistedMonthlyGenerationRateLimiter) rather than
// load-then-save, so concurrent requests near the monthly cap can't race
// past it. Persisted -- unlike the daily cap (#214), which is in-memory --
// because this is the limit actually guarding real Anthropic spend and must
// survive a server restart or redeploy mid-month. Not keyed to any teacher:
// the cap is a single app-wide total.
public class AiBulkGenerationMonthlyUsage
{
    public Guid Id { get; set; }

    // Always the 1st of the month; the unique index on this column is what
    // makes "ensure this month's row exists" race-safe (see the limiter's
    // catch-and-retry on a unique-constraint violation).
    public required DateOnly Month { get; set; }

    public int Count { get; set; }
}
