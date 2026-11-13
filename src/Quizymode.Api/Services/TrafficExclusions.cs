using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

/// <summary>Sessions excluded from a window's reports, by traffic class (#573). Counts are sessions, never hits.</summary>
/// <param name="Maintainer">Admin, flagged user, marked browser, or a session excluded only through a shared visitor id.</param>
/// <param name="Automated">Sessions carrying the E2E user-agent token.</param>
/// <param name="KnownBot">Crawlers and headless default user agents.</param>
/// <param name="InternalUnsplit">Rows written before traffic classes existed that only carry the legacy internal flag.</param>
public sealed record ExcludedSessionCounts(int Maintainer, int Automated, int KnownBot, int InternalUnsplit)
{
    public int Total => Maintainer + Automated + KnownBot + InternalUnsplit;
}

internal static class TrafficExclusions
{
    /// <summary>
    /// Counts the sessions with a hit in <c>[startUtc, endExclusiveUtc)</c> that the reports exclude. A session takes the
    /// highest-precedence class among its hits: automated, known_bot, maintainer, then internal (unsplit).
    /// </summary>
    public static async Task<ExcludedSessionCounts> CountAsync(
        ApplicationDbContext db,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken)
    {
        IQueryable<PageView> window = db.PageViews
            .AsNoTracking()
            .Where(pageView => pageView.CreatedUtc >= startUtc && pageView.CreatedUtc < endExclusiveUtc);

        var sessions = await window
            .GroupBy(pageView => pageView.SessionId)
            .Select(group => new
            {
                SessionId = group.Key,
                Automated = group.Max(pageView => pageView.TrafficClass == TrafficClassifier.Automated ? 1 : 0),
                Bot = group.Max(pageView => pageView.IsBot ? 1 : 0),
                Maintainer = group.Max(pageView => pageView.TrafficClass == TrafficClassifier.Maintainer ? 1 : 0),
                Legacy = group.Max(pageView => pageView.TrafficClass == null && pageView.IsInternal ? 1 : 0)
            })
            .ToListAsync(cancellationToken);

        HashSet<string> internalIds = (await InternalTrafficFilter.InternalSessionIds(db, window).ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.Ordinal);

        int maintainer = 0;
        int automated = 0;
        int knownBot = 0;
        int unsplit = 0;
        foreach (var session in sessions)
        {
            if (session.Automated == 1)
            {
                automated++;
            }
            else if (session.Bot == 1)
            {
                knownBot++;
            }
            else if (internalIds.Contains(session.SessionId))
            {
                // Legacy-only evidence stays unsplit; flagged users and visitor-id siblings are maintainer traffic.
                if (session.Maintainer == 0 && session.Legacy == 1)
                {
                    unsplit++;
                }
                else
                {
                    maintainer++;
                }
            }
        }

        return new ExcludedSessionCounts(maintainer, automated, knownBot, unsplit);
    }
}
