using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin.DailyDigest;

// Daily digest sections (M1-M14, M16). Each section fails on its own and is then reported as unavailable, never as zero.
internal static partial class DailySummaryBuilder
{
    /// <summary>How long after a window ends a quiz completion still counts for a run that started inside it.</summary>
    internal static readonly TimeSpan CompletionGrace = TimeSpan.FromHours(6);

    private const int MaxCollectionLookups = 200;
    private const int SessionIdChunk = 1000;

    [GeneratedRegex("^[a-z0-9._-]{1,40}$")]
    private static partial Regex SafeTokenPattern();

    [GeneratedRegex("^[a-z0-9.-]{1,80}$")]
    private static partial Regex SafeHostPattern();

    /// <summary>One quiz-related event with only the fields the digest needs.</summary>
    internal sealed record QuizEventRow(string EventName, string SessionId, string RunId, string? ContextType, string? ContextId, DateTime OccurredUtc);

    internal sealed record QuizRunStart(string SessionId, string RunId, string? ContextType, string? ContextId);

    internal sealed record QuizRunCounts(List<QuizRunStart> Starts, int Completed);

    /// <summary>
    /// Builds every per-window section independently: a section that throws is returned as null ("unavailable").
    /// <paramref name="cohortRows"/> is null when loading them failed.
    /// </summary>
    internal static async Task<DaySummary> BuildDayAsync(
        ApplicationDbContext db,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        List<VisitorCohortReport.CohortRow>? cohortRows,
        bool includeSources,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        Dictionary<string, string?> visitorBySession = (cohortRows ?? [])
            .GroupBy(row => row.SessionId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First().VisitorId, StringComparer.Ordinal);

        List<SessionClassifier.ClassifiedSession>? sessions = await Section("sessions", logger, () =>
            ClassifyWindowAsync(db, startUtc, endExclusiveUtc, cancellationToken));

        VisitsSection? visits = sessions is null || cohortRows is null
            ? null
            : await Section("visits", logger, () => BuildVisitsAsync(db, sessions, cohortRows, visitorBySession, startUtc, endExclusiveUtc, cancellationToken));

        AccountsSection? accounts = sessions is null
            ? null
            : await Section("accounts", logger, () => BuildAccountsAsync(db, sessions, startUtc, endExclusiveUtc, cancellationToken));

        QuizRunCounts? runs = await Section("quiz runs", logger, () =>
            LoadQuizRunsAsync(db, startUtc, endExclusiveUtc, endExclusiveUtc + CompletionGrace, cancellationToken));
        QuizSection? quizzes = runs is null
            ? null
            : await Section("quizzes", logger, () => BuildQuizSectionAsync(db, runs, visitorBySession, includeSources, cancellationToken));

        SourcesSection? sources = !includeSources || sessions is null || runs is null
            ? null
            : await Section("sources", logger, () => BuildSourcesAsync(db, sessions, runs, startUtc, endExclusiveUtc, cancellationToken));

        ProblemsSection? problems = await Section("problems", logger, () =>
            BuildProblemsAsync(db, startUtc, endExclusiveUtc, cancellationToken));

        LocationsSection? locations = !includeSources || sessions is null
            ? null
            : await Section("locations", logger, () => BuildLocationsAsync(db, sessions, cancellationToken));

        return new DaySummary(visits, accounts, quizzes, sources, problems, locations);
    }

    /// <summary>Raw rows in the window including bot and internal traffic, for the data check (M16), and the excluded sessions per class.</summary>
    internal static async Task<DigestHealth> BuildHealthAsync(
        ApplicationDbContext db,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken)
    {
        int pageViews = await db.PageViews.AsNoTracking()
            .CountAsync(pageView => pageView.CreatedUtc >= startUtc && pageView.CreatedUtc < endExclusiveUtc, cancellationToken);
        int events = await db.AnalyticsEvents.AsNoTracking()
            .CountAsync(analyticsEvent => analyticsEvent.OccurredUtc >= startUtc && analyticsEvent.OccurredUtc < endExclusiveUtc, cancellationToken);
        ExcludedSessionCounts excluded = await CountExcludedAsync(db, startUtc, endExclusiveUtc, cancellationToken);
        return new DigestHealth(pageViews, events, excluded);
    }

    internal static async Task<T?> Section<T>(string name, ILogger logger, Func<Task<T>> build)
        where T : class
    {
        try
        {
            return await build();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Type only: messages can echo SQL or data.
            logger.LogWarning("DailyDigest: section {Section} unavailable ({ErrorType})", name, ex.GetType().Name);
            return null;
        }
    }

    private static async Task<VisitsSection> BuildVisitsAsync(
        ApplicationDbContext db,
        List<SessionClassifier.ClassifiedSession> sessions,
        List<VisitorCohortReport.CohortRow> cohortRows,
        Dictionary<string, string?> visitorBySession,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken)
    {
        VisitorCohortReport.Response visitors = await BuildVisitorsAsync(db, cohortRows, startUtc, endExclusiveUtc, cancellationToken);
        List<string?> visitorIds = sessions
            .Select(session => visitorBySession.TryGetValue(session.SessionId, out string? visitorId) ? visitorId : null)
            .ToList();

        return new VisitsSection(
            sessions.Sum(session => session.PageHits),
            sessions.Count,
            sessions.Count(session => session.IsEngaged),
            visitorIds.Where(id => id is not null).Distinct(StringComparer.Ordinal).Count(),
            visitorIds.Count(id => id is null),
            visitors.NewVisitors,
            visitors.ReturningVisitors,
            sessions.Sum(session => session.ItemSteps));
    }

    private static async Task<AccountsSection> BuildAccountsAsync(
        ApplicationDbContext db,
        List<SessionClassifier.ClassifiedSession> sessions,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken)
    {
        SessionStats stats = Summarize(sessions);
        int newAccounts = (await LoadNewAccountsAsync(db, startUtc, endExclusiveUtc, cancellationToken)).Count;
        return new AccountsSection(stats.ActiveAccounts, newAccounts, stats.AnonymousSessions, stats.ConvertedSessions, stats.AuthenticatedSessions);
    }

    /// <summary>
    /// Quiz runs started in <c>[startUtc, endExclusiveUtc)</c> and how many have a completion before
    /// <paramref name="completionCutoffUtc"/>. Bot events and internal sessions are excluded over the extended range
    /// <c>[startUtc, completionCutoffUtc)</c>, so internal completions in the grace period never count. Learn runs are not quizzes.
    /// </summary>
    internal static async Task<QuizRunCounts> LoadQuizRunsAsync(
        ApplicationDbContext db,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        DateTime completionCutoffUtc,
        CancellationToken cancellationToken)
    {
        IQueryable<AnalyticsEvent> range = db.AnalyticsEvents
            .AsNoTracking()
            .Where(analyticsEvent =>
                analyticsEvent.OccurredUtc >= startUtc
                && analyticsEvent.OccurredUtc < completionCutoffUtc
                && (analyticsEvent.EventName == AnalyticsEventCatalog.QuickQuizStarted
                    || analyticsEvent.EventName == AnalyticsEventCatalog.QuizCompleted));
        IQueryable<string> internalSessionIds = InternalTrafficFilter.InternalEventSessionIds(db, range);

        List<QuizEventRow> rows = await range
            .Where(analyticsEvent => !analyticsEvent.IsBot && analyticsEvent.RunId != null && !internalSessionIds.Contains(analyticsEvent.SessionId))
            .Select(analyticsEvent => new QuizEventRow(
                analyticsEvent.EventName,
                analyticsEvent.SessionId,
                analyticsEvent.RunId!,
                analyticsEvent.ContextType,
                analyticsEvent.ContextId,
                analyticsEvent.OccurredUtc))
            .ToListAsync(cancellationToken);

        return CountQuizRuns(rows, startUtc, endExclusiveUtc, completionCutoffUtc);
    }

    /// <summary>
    /// Cohort by start: a run counts when its start is in the window; it is completed when a completion for the same
    /// (session, run) is before <paramref name="completionCutoffUtc"/>. Duplicate events count once.
    /// </summary>
    internal static QuizRunCounts CountQuizRuns(
        IEnumerable<QuizEventRow> rows,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        DateTime completionCutoffUtc)
    {
        List<QuizEventRow> all = rows.ToList();
        List<QuizRunStart> starts = all
            .Where(row => row.EventName == AnalyticsEventCatalog.QuickQuizStarted
                && row.OccurredUtc >= startUtc
                && row.OccurredUtc < endExclusiveUtc
                && row.ContextType != "learn")
            .GroupBy(row => (row.SessionId, row.RunId))
            .Select(group => group.OrderBy(row => row.OccurredUtc).First())
            .Select(row => new QuizRunStart(row.SessionId, row.RunId, row.ContextType, row.ContextId))
            .ToList();

        HashSet<(string, string)> completedKeys = all
            .Where(row => row.EventName == AnalyticsEventCatalog.QuizCompleted && row.OccurredUtc < completionCutoffUtc)
            .Select(row => (row.SessionId, row.RunId))
            .ToHashSet();

        return new QuizRunCounts(starts, starts.Count(start => completedKeys.Contains((start.SessionId, start.RunId))));
    }

    private static async Task<QuizSection> BuildQuizSectionAsync(
        ApplicationDbContext db,
        QuizRunCounts runs,
        Dictionary<string, string?> visitorBySession,
        bool includeTopics,
        CancellationToken cancellationToken)
    {
        int participants = runs.Starts
            .Select(start => visitorBySession.TryGetValue(start.SessionId, out string? visitorId) && visitorId is not null ? "v:" + visitorId : "s:" + start.SessionId)
            .Distinct(StringComparer.Ordinal)
            .Count();

        List<TopicCount> topics = [];
        if (includeTopics && runs.Starts.Count > 0)
        {
            var grouped = runs.Starts
                .GroupBy(start => (start.ContextType, start.ContextId))
                .Select(group => new { group.Key.ContextType, group.Key.ContextId, Count = group.Count() })
                .OrderByDescending(group => group.Count)
                .ToList();

            List<Guid> collectionIds = grouped
                .Where(group => group.ContextType == "collection" && Guid.TryParse(group.ContextId, out _))
                .Select(group => Guid.Parse(group.ContextId!))
                .Distinct()
                .Take(MaxCollectionLookups)
                .ToList();
            Dictionary<Guid, (string Name, bool IsPublic)> collections = collectionIds.Count == 0
                ? []
                : (await db.Collections.AsNoTracking()
                        .Where(collection => collectionIds.Contains(collection.Id))
                        .Select(collection => new { collection.Id, collection.Name, collection.IsPublic })
                        .ToListAsync(cancellationToken))
                    .ToDictionary(collection => collection.Id, collection => (collection.Name, collection.IsPublic));

            topics = grouped
                .Select(group => new TopicCount(TopicLabel(group.ContextType, group.ContextId, collections), group.Count))
                .GroupBy(topic => topic.Label, StringComparer.Ordinal)
                .Select(group => new TopicCount(group.Key, group.Sum(topic => topic.Starts)))
                .OrderByDescending(topic => topic.Starts)
                .ThenBy(topic => topic.Label, StringComparer.Ordinal)
                .Take(3)
                .ToList();
        }

        return new QuizSection(runs.Starts.Count, runs.Completed, participants, topics);
    }

    private static string TopicLabel(string? contextType, string? contextId, Dictionary<Guid, (string Name, bool IsPublic)> collections)
    {
        switch (contextType)
        {
            case "daily":
                return "Daily quiz";
            case "category":
                return SafeToken(contextId?.Trim().ToLowerInvariant(), SafeTokenPattern());
            case "collection":
                if (Guid.TryParse(contextId, out Guid id) && collections.TryGetValue(id, out (string Name, bool IsPublic) collection))
                {
                    return collection.IsPublic ? CleanText(collection.Name, 60) : "a private collection";
                }

                return "a collection";
            default:
                return SafeToken(contextType, SafeTokenPattern());
        }
    }

    /// <summary>Strips control characters and truncates; used only for public collection names.</summary>
    internal static string CleanText(string value, int maxLength)
    {
        string cleaned = new(value.Where(character => !char.IsControl(character)).ToArray());
        cleaned = cleaned.Trim();
        if (cleaned.Length > maxLength)
        {
            cleaned = cleaned[..maxLength].TrimEnd() + "...";
        }

        return cleaned.Length == 0 ? "other" : cleaned;
    }

    private static string SafeToken(string? value, Regex pattern) =>
        value is not null && pattern.IsMatch(value) ? value : "other";

    /// <summary>Label of sessions with no tag and no external referrer (also sessions without an attribution row).</summary>
    internal const string DirectLabel = "Direct / unknown";

    private const int TopRows = 10;

    /// <summary>
    /// The printable source of a session: utm_source, else referrer host, else the channel, else "Direct / unknown".
    /// LinkedIn and Medium are named; anything unsafe becomes "other".
    /// </summary>
    internal static string SourceKey(string? utmSource, string? referrerHost, string? channel)
    {
        string source = utmSource?.Trim().ToLowerInvariant() ?? string.Empty;
        string host = referrerHost?.Trim().ToLowerInvariant() ?? string.Empty;

        if (source == "linkedin" || (source.Length == 0 && IsLinkedInHost(host)))
        {
            return "LinkedIn";
        }

        if (source == "medium" || (source.Length == 0 && IsMediumHost(host)))
        {
            return "Medium";
        }

        if (source.Length > 0)
        {
            return SafeToken(source, SafeTokenPattern());
        }

        if (host.Length > 0)
        {
            return SafeToken(host, SafeHostPattern());
        }

        string channelName = channel?.Trim().ToLowerInvariant() ?? string.Empty;
        return channelName switch
        {
            "" or "direct" or "unknown" => DirectLabel,
            "shared-link" => "Shared link",
            _ => SafeToken(channelName, SafeTokenPattern())
        };
    }

    private static bool IsLinkedInHost(string host) =>
        host.Contains("linkedin", StringComparison.Ordinal) || host == "lnkd.in";

    private static bool IsMediumHost(string host) =>
        host == "medium.com" || host.EndsWith(".medium.com", StringComparison.Ordinal);

    private static async Task<SourcesSection> BuildSourcesAsync(
        ApplicationDbContext db,
        List<SessionClassifier.ClassifiedSession> sessions,
        QuizRunCounts runs,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken)
    {
        Dictionary<string, string> bySession = new(StringComparer.Ordinal);
        List<string> sessionIds = sessions.Select(session => session.SessionId).ToList();
        for (int offset = 0; offset < sessionIds.Count; offset += SessionIdChunk)
        {
            List<string> chunk = sessionIds.Skip(offset).Take(SessionIdChunk).ToList();
            var rows = await db.AnalyticsSessions.AsNoTracking()
                .Where(session => chunk.Contains(session.SessionId))
                .Select(session => new { session.SessionId, session.UtmSource, session.ReferrerHost, session.Channel })
                .ToListAsync(cancellationToken);
            foreach (var row in rows)
            {
                bySession[row.SessionId] = SourceKey(row.UtmSource, row.ReferrerHost, row.Channel);
            }
        }

        // Sessions without a first-hit attribution row are "Direct / unknown".
        string Resolve(string sessionId) => bySession.TryGetValue(sessionId, out string? found) ? found : DirectLabel;

        // Accounts created in the window (maintainer and automated first sessions excluded), attributed to the source of the account's earliest linked session.
        List<Guid> newUserIds = (await LoadNewAccountsAsync(db, startUtc, endExclusiveUtc, cancellationToken))
            .Select(user => user.Id)
            .ToList();
        List<string> signupSources = [];
        if (newUserIds.Count > 0)
        {
            var linked = await db.AnalyticsSessions.AsNoTracking()
                .Where(session => session.UserId != null && newUserIds.Contains(session.UserId.Value))
                .Select(session => new { session.UserId, session.FirstSeenUtc, session.UtmSource, session.ReferrerHost, session.Channel })
                .ToListAsync(cancellationToken);
            signupSources = linked
                .GroupBy(row => row.UserId)
                .Select(group => group.OrderBy(row => row.FirstSeenUtc).First())
                .Select(row => SourceKey(row.UtmSource, row.ReferrerHost, row.Channel))
                .ToList();
        }

        List<(string Source, SessionClassifier.ClassifiedSession Session)> pairs = sessions
            .Select(session => (Resolve(session.SessionId), session))
            .ToList();

        SourceRow Row(string name, IEnumerable<(string Source, SessionClassifier.ClassifiedSession Session)> members, int newAccounts)
        {
            List<(string Source, SessionClassifier.ClassifiedSession Session)> list = members.ToList();
            HashSet<string> memberIds = list.Select(pair => pair.Session.SessionId).ToHashSet(StringComparer.Ordinal);
            return new SourceRow(
                name,
                list.Count,
                list.Count(pair => pair.Session.IsEngaged),
                runs.Starts.Count(start => memberIds.Contains(start.SessionId)),
                list.Count(pair => pair.Session.Outcome == SessionClassifier.OutcomeConverted),
                newAccounts);
        }

        List<SourceRow> ordered = pairs
            .GroupBy(pair => pair.Source, StringComparer.Ordinal)
            .Select(group => Row(group.Key, group, signupSources.Count(source => source == group.Key)))
            .OrderByDescending(row => row.Sessions)
            .ThenBy(row => row.Name, StringComparer.Ordinal)
            .ToList();

        // The top rows plus one "Other" row, so the table always adds up to the session total.
        List<SourceRow> top = ordered.Take(TopRows).ToList();
        List<SourceRow> rest = ordered.Skip(TopRows).ToList();
        SourceRow? other = rest.Count == 0
            ? null
            : new SourceRow(
                "Other",
                rest.Sum(row => row.Sessions),
                rest.Sum(row => row.EngagedSessions),
                rest.Sum(row => row.QuizStarts),
                rest.Sum(row => row.ConvertedSessions),
                rest.Sum(row => row.NewAccounts));
        return new SourcesSection(top, other);
    }

    private static string? CleanLocation(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        string trimmed = value.Trim();
        // "Local" is what the geolocation service returns for private and loopback addresses; it is never a place.
        return trimmed.Equals("Local", StringComparison.OrdinalIgnoreCase) || trimmed.Equals("unknown", StringComparison.OrdinalIgnoreCase)
            ? null
            : CleanText(trimmed, 40);
    }

    /// <summary>Top countries and regions of the window's sessions, with Other and Unknown buckets (#573).</summary>
    private static async Task<LocationsSection> BuildLocationsAsync(
        ApplicationDbContext db,
        List<SessionClassifier.ClassifiedSession> sessions,
        CancellationToken cancellationToken)
    {
        Dictionary<string, (string? Country, string? Region)> bySession = new(StringComparer.Ordinal);
        List<string> sessionIds = sessions.Select(session => session.SessionId).ToList();
        for (int offset = 0; offset < sessionIds.Count; offset += SessionIdChunk)
        {
            List<string> chunk = sessionIds.Skip(offset).Take(SessionIdChunk).ToList();
            var rows = await db.AnalyticsSessions.AsNoTracking()
                .Where(session => chunk.Contains(session.SessionId))
                .Select(session => new { session.SessionId, session.Country, session.Region })
                .ToListAsync(cancellationToken);
            foreach (var row in rows)
            {
                bySession[row.SessionId] = (CleanLocation(row.Country), CleanLocation(row.Region));
            }
        }

        List<(string? Country, string? Region)> places = sessionIds
            .Select(sessionId => bySession.TryGetValue(sessionId, out (string? Country, string? Region) place) ? place : (null, null))
            .ToList();

        LocationBreakdown countries = Breakdown(places.Select(place => place.Country));
        LocationBreakdown regions = Breakdown(places.Select(place =>
            place.Region is null ? null : place.Country is null ? place.Region : $"{place.Region}, {place.Country}"));
        return new LocationsSection(countries, regions);
    }

    internal static LocationBreakdown Breakdown(IEnumerable<string?> labels)
    {
        List<string?> all = labels.ToList();
        List<LocationRow> ordered = all
            .Where(label => label is not null)
            .GroupBy(label => label!, StringComparer.Ordinal)
            .Select(group => new LocationRow(group.Key, group.Count()))
            .OrderByDescending(row => row.Sessions)
            .ThenBy(row => row.Name, StringComparer.Ordinal)
            .ToList();
        return new LocationBreakdown(
            ordered.Take(TopRows).ToList(),
            ordered.Skip(TopRows).Sum(row => row.Sessions),
            all.Count(label => label is null));
    }

    private static async Task<ProblemsSection> BuildProblemsAsync(
        ApplicationDbContext db,
        DateTime startUtc,
        DateTime endExclusiveUtc,
        CancellationToken cancellationToken)
    {
        GetClientErrors.WindowCounts errors = await GetClientErrors.CountForWindowAsync(db, startUtc, endExclusiveUtc, cancellationToken);

        // Feedback is filtered by session class as well as by the user flag (#573): maintainer, automated and bot sessions are excluded.
        var submissions = await db.FeedbackSubmissions.AsNoTracking()
            .Where(submission => submission.CreatedAt >= startUtc && submission.CreatedAt < endExclusiveUtc)
            .Select(submission => new { submission.Type, submission.UserId, submission.SessionId })
            .ToListAsync(cancellationToken);

        List<string> feedbackSessionIds = submissions
            .Where(submission => submission.SessionId != null)
            .Select(submission => submission.SessionId!)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        List<Guid> feedbackUserIds = submissions
            .Where(submission => submission.UserId != null)
            .Select(submission => submission.UserId!.Value)
            .Distinct()
            .ToList();
        HashSet<string> excludedSessions = [];
        if (feedbackSessionIds.Count > 0)
        {
            excludedSessions.UnionWith(await InternalTrafficFilter.AllInternalSessionIds(db)
                .Where(sessionId => feedbackSessionIds.Contains(sessionId))
                .ToListAsync(cancellationToken));
            excludedSessions.UnionWith(await db.PageViews.AsNoTracking()
                .Where(pageView => pageView.IsBot && feedbackSessionIds.Contains(pageView.SessionId))
                .Select(pageView => pageView.SessionId)
                .Distinct()
                .ToListAsync(cancellationToken));
        }

        HashSet<Guid> internalUsers = feedbackUserIds.Count == 0
            ? []
            : (await db.Users.AsNoTracking()
                    .Where(user => user.IsInternal && feedbackUserIds.Contains(user.Id))
                    .Select(user => user.Id)
                    .ToListAsync(cancellationToken))
                .ToHashSet();

        var feedback = submissions
            .Where(submission => (submission.UserId is null || !internalUsers.Contains(submission.UserId.Value))
                && (submission.SessionId is null || !excludedSessions.Contains(submission.SessionId)))
            .GroupBy(submission => submission.Type)
            .Select(group => new { Type = group.Key, Count = group.Count() })
            .ToList();
        int problemReports = feedback.Where(row => row.Type == "reportIssue").Sum(row => row.Count);
        int otherFeedback = feedback.Where(row => row.Type != "reportIssue").Sum(row => row.Count);

        // Unclassified (older) picture reports count as audience; maintainer, automated and bot reports do not.
        int pictureReports = await db.MediaReports.AsNoTracking()
            .CountAsync(report => report.CreatedAt >= startUtc && report.CreatedAt < endExclusiveUtc
                && (report.TrafficClass == null || report.TrafficClass == TrafficClassifier.Audience), cancellationToken);

        return new ProblemsSection(errors.Reports, errors.Sessions, errors.SignedInUsers, errors.NewGroups, problemReports, otherFeedback, pictureReports);
    }
}
