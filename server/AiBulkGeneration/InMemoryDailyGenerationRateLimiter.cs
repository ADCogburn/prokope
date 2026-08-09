namespace server.AiBulkGeneration;

// In-memory by design (ADR-0020): a server restart resetting a teacher's
// count early is accepted as low-stakes, in exchange for avoiding a DB
// round-trip on every generation request. Contrast with the monthly cap
// (#215), which guards real Anthropic spend and must survive a restart, so
// it's persisted instead. Registered as a singleton -- state must be shared
// across every request, not per-scope.
public class InMemoryDailyGenerationRateLimiter(int dailyLimit) : IDailyGenerationRateLimiter
{
    private readonly Dictionary<Guid, (DateOnly Day, int Count)> _counts = [];
    private readonly Lock _lock = new();

    public int DailyLimit => dailyLimit;

    public bool TryRecordAttempt(Guid teacherId)
    {
        lock (_lock)
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            // A stored count from a previous calendar day is stale -- treat
            // it as zero rather than carrying it into today, which is how
            // the cap resets on the day boundary.
            var count = _counts.TryGetValue(teacherId, out var entry) && entry.Day == today ? entry.Count : 0;

            if (count >= dailyLimit)
            {
                return false;
            }

            _counts[teacherId] = (today, count + 1);
            return true;
        }
    }
}
