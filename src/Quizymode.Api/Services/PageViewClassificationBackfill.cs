using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

/// <summary>
/// Backfill that classifies historical <see cref="PageView"/> rows written before ANALYTICS-004 with
/// the same <see cref="PageHitClassifier"/> that <c>TrackPageView</c> uses at write time, so
/// backfilled and new rows always agree. Run by <see cref="PageViewRetentionService"/> at the start
/// of every maintenance pass (before rollup and pruning, so the steps never race), in batches of
/// <see cref="BatchSize"/>. Idempotent: it only selects rows whose <c>Area</c> is still null, and the
/// classifier always sets one, so a caught-up database does no work.
/// </summary>
internal static class PageViewClassificationBackfill
{
    public const int BatchSize = 2000;

    /// <summary>Classifies every unclassified row; returns how many were updated.</summary>
    public static async Task<int> RunAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        int total = 0;
        while (true)
        {
            List<PageView> batch = await db.PageViews
                .Where(pageView => pageView.Area == null)
                .OrderBy(pageView => pageView.Id)
                .Take(BatchSize)
                .ToListAsync(cancellationToken);

            if (batch.Count == 0)
            {
                return total;
            }

            foreach (PageView pageView in batch)
            {
                Apply(pageView, PageHitClassifier.Classify(pageView.Path, pageView.QueryString));
            }

            await db.SaveChangesAsync(cancellationToken);
            db.ChangeTracker.Clear();
            total += batch.Count;

            if (batch.Count < BatchSize)
            {
                return total;
            }
        }
    }

    public static void Apply(PageView pageView, PageHitClassifier.Classification classification)
    {
        pageView.Area = classification.Area;
        pageView.ScopeType = classification.ScopeType;
        pageView.ScopeKey = classification.ScopeKey;
        pageView.NavPath = classification.NavPath;
        pageView.IsItemStep = classification.IsItemStep;
    }
}
