using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

/// <summary>
/// Session-level exclusion of internal traffic (admins, users flagged internal, and browsers
/// carrying the internal marker) for every admin analytics report.
/// </summary>
/// <remarks>
/// A session is internal when <em>any</em> of its hits is internal, so an anonymous visit that
/// later signs in as an internal user is excluded in full. The user flag is joined at query time
/// rather than copied onto hits, which makes flagging a user retroactive without rewriting rows.
/// </remarks>
internal static class InternalTrafficFilter
{
    /// <summary>
    /// Session ids, among the sessions present in <paramref name="scope"/>, that contain at least one
    /// internal hit anywhere in the table (not only inside the scope's time window).
    /// </summary>
    public static IQueryable<string> InternalSessionIds(ApplicationDbContext db, IQueryable<PageView> scope)
    {
        IQueryable<string> scopeSessionIds = scope.Select(pageView => pageView.SessionId);

        return db.PageViews
            .Where(pageView => scopeSessionIds.Contains(pageView.SessionId))
            .Where(pageView =>
                pageView.IsInternal ||
                (pageView.UserId != null && db.Users.Any(user => user.Id == pageView.UserId && user.IsInternal)))
            .Select(pageView => pageView.SessionId)
            .Distinct();
    }

    /// <summary>
    /// Session ids, among the sessions with events in <paramref name="eventScope"/>, that are internal: any of
    /// their events was internal at write time, their page-view session (same client session id) is
    /// internal, or any of their events belongs to a user flagged internal now (so flagging is retroactive).
    /// </summary>
    public static IQueryable<string> InternalEventSessionIds(ApplicationDbContext db, IQueryable<AnalyticsEvent> eventScope)
    {
        IQueryable<string> scopeSessionIds = eventScope.Select(analyticsEvent => analyticsEvent.SessionId);

        return InternalSessionIds(db, db.PageViews.Where(pageView => scopeSessionIds.Contains(pageView.SessionId)))
            .Union(eventScope
                .Where(analyticsEvent =>
                    analyticsEvent.IsInternal ||
                    (analyticsEvent.UserId != null &&
                        db.Users.Any(user => user.Id == analyticsEvent.UserId && user.IsInternal)))
                .Select(analyticsEvent => analyticsEvent.SessionId));
    }

    /// <summary>
    /// Session ids, among the sessions with front-end errors in <paramref name="errorScope"/>, that are internal:
    /// any of their error reports was internal at write time, their page-view session is internal, or a report
    /// belongs to a user flagged internal now (so flagging is retroactive).
    /// </summary>
    public static IQueryable<string> InternalClientErrorSessionIds(ApplicationDbContext db, IQueryable<ClientError> errorScope)
    {
        IQueryable<string> scopeSessionIds = errorScope.Select(clientError => clientError.SessionId);

        return InternalSessionIds(db, db.PageViews.Where(pageView => scopeSessionIds.Contains(pageView.SessionId)))
            .Union(errorScope
                .Where(clientError =>
                    clientError.IsInternal ||
                    (clientError.UserId != null &&
                        db.Users.Any(user => user.Id == clientError.UserId && user.IsInternal)))
                .Select(clientError => clientError.SessionId));
    }

    /// <summary>Removes every hit that belongs to an internal session.</summary>
    public static IQueryable<PageView> ExcludeInternalSessions(ApplicationDbContext db, IQueryable<PageView> query)
    {
        IQueryable<string> internalSessionIds = InternalSessionIds(db, query);

        return query.Where(pageView => !internalSessionIds.Contains(pageView.SessionId));
    }
}
