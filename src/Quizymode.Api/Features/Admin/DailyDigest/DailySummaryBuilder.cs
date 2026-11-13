using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin.DailyDigest;

/// <summary>
/// Explicit-bounds session and visitor numbers shared by the admin Overview and the daily digest (#509), so the two
/// can never disagree for the same window. All windows are half-open: <c>start &lt;= time &lt; endExclusive</c>.
/// Bots, maintainer and automated sessions are always excluded (traffic classes, #573).
/// </summary>
internal static partial class DailySummaryBuilder
{
    /// <summary>Counts derived from the classified sessions of one window.</summary>
    internal sealed record SessionStats(
        int HumanSessions,
        int EngagedSessions,
        int StudySessions,
        int ConvertedSessions,
        int AnonymousSessions,
        int AuthenticatedSessions,
        int ActiveAccounts);

    /// <summary>Human, non-internal sessions with at least one hit in the window, classified once.</summary>
    internal static async Task<List<SessionClassifier.ClassifiedSession>> ClassifyWindowAsync(
        ApplicationDbContext db,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken)
    {
        IQueryable<PageView> window = db.PageViews
            .AsNoTracking()
            .Where(pageView => pageView.CreatedUtc >= startUtc && pageView.CreatedUtc < endExclusiveUtc);

        // A session takes the highest-precedence class among its hits (#573), so one bot hit excludes the whole session.
        IQueryable<string> botSessionIds = window.Where(pageView => pageView.IsBot).Select(pageView => pageView.SessionId).Distinct();
        IQueryable<PageView> scope = window
            .Where(pageView => !botSessionIds.Any(sessionId => sessionId == pageView.SessionId && pageView.SessionId != null));
        scope = InternalTrafficFilter.ExcludeInternalSessions(db, scope);

        return await SessionClassifier.ClassifyAsync(scope, cancellationToken);
    }

    /// <summary>Sessions excluded from the same window as <see cref="ClassifyWindowAsync"/>, by traffic class.</summary>
    internal static Task<ExcludedSessionCounts> CountExcludedAsync(
        ApplicationDbContext db,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken) =>
        TrafficExclusions.CountAsync(db, startUtc, endExclusiveUtc, cancellationToken);

    /// <summary>
    /// Accounts created in the window that count as new accounts (#573): not flagged internal, and whose first linked session
    /// is not a maintainer or automated session. An account with no linked session counts unless it is flagged.
    /// </summary>
    internal static async Task<List<(Guid Id, DateTime CreatedAt)>> LoadNewAccountsAsync(
        ApplicationDbContext db,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken)
    {
        var users = (await db.Users.AsNoTracking()
                .Where(user => !user.IsInternal && user.CreatedAt >= startUtc && user.CreatedAt < endExclusiveUtc)
                .Select(user => new { user.Id, user.CreatedAt })
                .ToListAsync(cancellationToken))
            .Select(user => (user.Id, user.CreatedAt))
            .ToList();
        if (users.Count == 0)
        {
            return users;
        }

        List<Guid> userIds = users.Select(user => user.Id).ToList();
        var linked = await db.AnalyticsSessions.AsNoTracking()
            .Where(session => session.UserId != null && userIds.Contains(session.UserId.Value))
            .Select(session => new { session.UserId, session.SessionId, session.FirstSeenUtc })
            .ToListAsync(cancellationToken);
        Dictionary<Guid, string> firstSessionByUser = linked
            .GroupBy(row => row.UserId!.Value)
            .ToDictionary(group => group.Key, group => group.OrderBy(row => row.FirstSeenUtc).First().SessionId);
        if (firstSessionByUser.Count == 0)
        {
            return users;
        }

        List<string> firstSessionIds = firstSessionByUser.Values.Distinct(StringComparer.Ordinal).ToList();
        HashSet<string> excluded = (await InternalTrafficFilter.AllInternalSessionIds(db)
                .Where(sessionId => firstSessionIds.Contains(sessionId))
                .ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.Ordinal);

        return users
            .Where(user => !firstSessionByUser.TryGetValue(user.Id, out string? sessionId) || !excluded.Contains(sessionId))
            .ToList();
    }

    internal static SessionStats Summarize(List<SessionClassifier.ClassifiedSession> sessions)
    {
        return new SessionStats(
            sessions.Count,
            sessions.Count(session => session.IsEngaged),
            sessions.Count(session => session.HasStudyActivity),
            sessions.Count(session => session.Outcome == SessionClassifier.OutcomeConverted),
            sessions.Count(session => session.Outcome == SessionClassifier.OutcomeAnonymous),
            sessions.Count(session => session.Outcome == SessionClassifier.OutcomeAuthenticated),
            sessions.Where(session => session.UserId.HasValue).Select(session => session.UserId!.Value).Distinct().Count());
    }

    /// <summary>
    /// New and returning visitors for a half-open window from cohort rows loaded once for all windows.
    /// <see cref="VisitorCohortReport"/> uses an inclusive end, so the exclusive end is converted by one tick.
    /// </summary>
    internal static Task<VisitorCohortReport.Response> BuildVisitorsAsync(
        ApplicationDbContext db,
        List<VisitorCohortReport.CohortRow> cohortRows,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken) =>
        VisitorCohortReport.BuildAsync(db, cohortRows, startUtc, endExclusiveUtc.AddTicks(-1), cancellationToken);
}
