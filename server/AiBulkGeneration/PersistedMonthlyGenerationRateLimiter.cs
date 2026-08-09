using Microsoft.EntityFrameworkCore;
using server.Data;
using server.Data.Entities;

namespace server.AiBulkGeneration;

// Scoped (not Singleton like InMemoryDailyGenerationRateLimiter) since it
// depends on AppDbContext, itself Scoped. The persisted count is the shared
// state here, not this object -- a fresh instance per request is fine.
public class PersistedMonthlyGenerationRateLimiter(AppDbContext db, int monthlyLimit) : IMonthlyGenerationRateLimiter
{
    public int MonthlyLimit => monthlyLimit;

    public async Task<bool> TryRecordAttemptAsync(CancellationToken cancellationToken = default)
    {
        var month = CurrentMonth();

        // Up to two attempts: the common case (this month's row already
        // exists) resolves in one atomic ExecuteUpdateAsync below. The only
        // case needing a second attempt is the very first request of a new
        // month, where two concurrent requests could both find no row and
        // race to create it -- the loser's unique-constraint violation is
        // caught, and its retry hits the row the winner just created.
        for (var attempt = 0; attempt < 2; attempt++)
        {
            // A single UPDATE ... WHERE count < cap statement: atomic at the
            // database level, so concurrent requests near the cap can't both
            // read a stale count and both squeak through.
            var updated = await db.AiBulkGenerationMonthlyUsage
                .Where(u => u.Month == month && u.Count < monthlyLimit)
                .ExecuteUpdateAsync(setters => setters.SetProperty(u => u.Count, u => u.Count + 1), cancellationToken);

            if (updated > 0)
            {
                return true;
            }

            var exists = await db.AiBulkGenerationMonthlyUsage.AnyAsync(u => u.Month == month, cancellationToken);
            if (exists)
            {
                // The row exists and the update above matched zero rows --
                // genuinely at cap, not a missing-row situation.
                return false;
            }

            try
            {
                db.AiBulkGenerationMonthlyUsage.Add(new AiBulkGenerationMonthlyUsage { Id = Guid.NewGuid(), Month = month, Count = 1 });
                await db.SaveChangesAsync(cancellationToken);
                return true;
            }
            catch (DbUpdateException)
            {
                // Lost the create race to a concurrent request -- clear the
                // failed insert from the change tracker and retry via
                // ExecuteUpdateAsync above, against the row it just created.
                db.ChangeTracker.Clear();
            }
        }

        return false;
    }

    private static DateOnly CurrentMonth()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return new DateOnly(today.Year, today.Month, 1);
    }
}
