using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

/// <summary>
/// Reports how often a session that finished a first activity starts a second one, and whether that second activity is
/// in another topic (#715). Sessions are classified with the same bot, internal and entry-area rules as Usage Analytics.
/// </summary>
public static class GetSecondActivityReport
{
    /// <summary>Under this many qualifying sessions the rates are hidden and only counts are shown.</summary>
    public const int MinSessionsForRates = 20;

    private const int MaxSessionsAnalyzed = 50_000;
    private const string UnknownKey = "none";

    private static readonly string[] StartEvents = ["quick_quiz_started", "flashcards_started", "game_started"];
    private static readonly string[] CompletionEvents = ["quiz_completed", "game_completed"];
    private const string AnswerEvent = "question_answered";

    public sealed record Response(
        DateTime WindowStartUtc,
        DateTime WindowEndUtc,
        bool BotsExcluded,
        bool InternalExcluded,
        int QualifyingSessions,
        int SecondStartedSessions,
        double? SecondStartedPercent,
        Breakdown Second,
        double? MedianSecondsToFirstAnswer,
        bool RatesSuppressed,
        string? Note,
        IReadOnlyList<AreaResponse> ByEntryArea);

    public sealed record Breakdown(int SameScope, int OtherTopic, int SameTopicDifferentScope, int Unknown);

    public sealed record AreaResponse(
        string Area,
        int QualifyingSessions,
        int SecondStartedSessions,
        Breakdown Second,
        double? MedianSecondsToFirstAnswer);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/analytics/second-activity", Handler)
                .WithTags("Admin")
                .WithSummary("Get second-activity and cross-topic starts per session (Admin only)")
                .WithDescription("Returns, for sessions that completed a first activity, how many started another and whether it changed topic, split by entry area. Bot and internal sessions are excluded unless includeBots or includeInternal is true.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            int days = 14,
            bool includeBots = false,
            bool includeInternal = false,
            ApplicationDbContext db = null!,
            CancellationToken cancellationToken = default)
        {
            Result<Response> result = await HandleAsync(days, includeBots, includeInternal, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        int days,
        bool includeBots,
        bool includeInternal,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        if (days is < 1 or > PageViewRetentionService.RetentionDays)
        {
            return Result.Failure<Response>(
                Error.Validation("Admin.SecondActivity.InvalidDays", $"Days must be between 1 and {PageViewRetentionService.RetentionDays}. Engagement data is kept for {PageViewRetentionService.RetentionDays} days."));
        }

        DateTime windowEndUtc = DateTime.UtcNow;
        DateTime windowStartUtc = windowEndUtc.AddDays(-days);

        IQueryable<PageView> pageWindow = db.PageViews
            .AsNoTracking()
            .Where(pageView => pageView.CreatedUtc >= windowStartUtc && pageView.CreatedUtc <= windowEndUtc);

        IQueryable<PageView> pageBase = includeBots ? pageWindow : pageWindow.Where(pageView => !pageView.IsBot);
        if (!includeInternal)
        {
            pageBase = InternalTrafficFilter.ExcludeInternalSessions(db, pageBase);
        }

        int sessionCount = await pageBase.Select(pageView => pageView.SessionId).Distinct().CountAsync(cancellationToken);
        if (sessionCount > MaxSessionsAnalyzed)
        {
            return Result.Failure<Response>(
                Error.Validation("Admin.SecondActivity.WindowTooLarge", $"The selected window contains {sessionCount} sessions, which exceeds the {MaxSessionsAnalyzed} session analysis limit. Select a shorter time range."));
        }

        // Same classification as the Usage Analytics sessions list, so entry areas match that report.
        List<SessionClassifier.ClassifiedSession> sessions = await SessionClassifier.ClassifyAsync(pageBase, cancellationToken);
        HashSet<string> sessionIds = sessions.Select(session => session.SessionId).ToHashSet(StringComparer.Ordinal);

        IQueryable<AnalyticsEvent> eventWindow = db.AnalyticsEvents
            .AsNoTracking()
            .Where(analyticsEvent => analyticsEvent.OccurredUtc >= windowStartUtc && analyticsEvent.OccurredUtc <= windowEndUtc)
            .Where(analyticsEvent => StartEvents.Contains(analyticsEvent.EventName)
                || CompletionEvents.Contains(analyticsEvent.EventName)
                || analyticsEvent.EventName == AnswerEvent);

        IQueryable<AnalyticsEvent> eventBase = includeBots ? eventWindow : eventWindow.Where(analyticsEvent => !analyticsEvent.IsBot);
        if (!includeInternal)
        {
            IQueryable<string> internalIds = InternalTrafficFilter.InternalEventSessionIds(db, eventWindow);
            eventBase = eventBase.Where(analyticsEvent => !internalIds.Contains(analyticsEvent.SessionId));
        }

        List<EventRow> events = (await eventBase
            .Select(analyticsEvent => new EventRow(
                analyticsEvent.SessionId,
                analyticsEvent.EventName,
                analyticsEvent.RunId,
                analyticsEvent.ContextType,
                analyticsEvent.ContextId,
                analyticsEvent.OccurredUtc))
            .ToListAsync(cancellationToken))
            .Where(row => sessionIds.Contains(row.SessionId))
            .ToList();

        Dictionary<string, List<EventRow>> bySession = events
            .GroupBy(row => row.SessionId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.Ordinal);

        List<SessionResult> results = [];
        foreach (SessionClassifier.ClassifiedSession session in sessions)
        {
            bySession.TryGetValue(session.SessionId, out List<EventRow>? rows);
            results.Add(Analyze(session, rows ?? []));
        }

        List<SessionResult> qualifying = results.Where(result => result.Qualifies).ToList();
        int secondStarted = qualifying.Count(result => result.Second is not null);
        Breakdown overall = BuildBreakdown(qualifying);

        List<AreaResponse> byArea = qualifying
            .GroupBy(result => result.EntryArea, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => new AreaResponse(
                group.Key,
                group.Count(),
                group.Count(result => result.Second is not null),
                BuildBreakdown(group.ToList()),
                Median(group.Select(result => result.SecondsToFirstAnswer))))
            .ToList();

        bool suppressed = qualifying.Count < MinSessionsForRates;

        return Result.Success(new Response(
            windowStartUtc,
            windowEndUtc,
            BotsExcluded: !includeBots,
            InternalExcluded: !includeInternal,
            QualifyingSessions: qualifying.Count,
            SecondStartedSessions: secondStarted,
            SecondStartedPercent: suppressed ? null : Percent(secondStarted, qualifying.Count),
            Second: overall,
            MedianSecondsToFirstAnswer: Median(qualifying.Select(result => result.SecondsToFirstAnswer)),
            RatesSuppressed: suppressed,
            Note: suppressed ? "Too few sessions for rates." : null,
            ByEntryArea: byArea));
    }

    /// <summary>
    /// The first start of the session and, when present, the next distinct start run after it. A run is qualifying
    /// once its completion event exists: a first completed activity is any start run with a completion event.
    /// </summary>
    private static SessionResult Analyze(SessionClassifier.ClassifiedSession session, List<EventRow> rows)
    {
        List<EventRow> starts = rows
            .Where(row => StartEvents.Contains(row.EventName) && !string.IsNullOrEmpty(row.RunId))
            .GroupBy(row => row.RunId!, StringComparer.Ordinal)
            .Select(group => group.OrderBy(row => row.OccurredUtc).First())
            .OrderBy(row => row.OccurredUtc)
            .ToList();

        HashSet<string> completedRuns = rows
            .Where(row => CompletionEvents.Contains(row.EventName) && !string.IsNullOrEmpty(row.RunId))
            .Select(row => row.RunId!)
            .ToHashSet(StringComparer.Ordinal);

        bool qualifies = starts.Any(start => completedRuns.Contains(start.RunId!));

        DateTime? firstAnswer = rows
            .Where(row => row.EventName == AnswerEvent)
            .Select(row => (DateTime?)row.OccurredUtc)
            .Min();

        double? seconds = firstAnswer is null ? null : Math.Max(0, (firstAnswer.Value - session.StartedUtc).TotalSeconds);

        Relation? second = null;
        if (qualifies && starts.Count >= 2)
        {
            EventRow first = starts[0];
            EventRow next = starts[1];
            second = Classify(first, next);
        }

        return new SessionResult(session.EntryArea, qualifies, second, seconds);
    }

    private static Relation Classify(EventRow first, EventRow next)
    {
        if (string.Equals(first.ContextType, next.ContextType, StringComparison.Ordinal)
            && string.Equals(first.ContextId, next.ContextId, StringComparison.Ordinal))
        {
            return Relation.SameScope;
        }

        string firstKey = TopicKey(first);
        string nextKey = TopicKey(next);
        if (firstKey == UnknownKey || nextKey == UnknownKey)
        {
            return Relation.Unknown;
        }

        return firstKey == nextKey ? Relation.SameTopicDifferentScope : Relation.OtherTopic;
    }

    /// <summary>
    /// The topic of a start, from its context: a category's first path segment, a game's category segment, a collection
    /// or home collection id, daily, or a learn scope's category. Anything else is unknown (#715).
    /// </summary>
    internal static string TopicKey(EventRow row)
    {
        string id = row.ContextId ?? string.Empty;
        switch (row.ContextType)
        {
            case "category":
                return FirstSegment(id);
            case "game":
                int marker = id.IndexOf(":category:", StringComparison.Ordinal);
                if (marker < 0)
                {
                    return UnknownKey;
                }

                string rest = id[(marker + ":category:".Length)..];
                return FirstSegment(rest);
            case "collection":
            case "home":
                return id.Length == 0 ? UnknownKey : $"collection:{id}";
            case "daily":
                return "daily";
            case "learn":
                return FirstSegment(id);
            default:
                return UnknownKey;
        }
    }

    private static string FirstSegment(string value)
    {
        string segment = value.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault() ?? string.Empty;
        return segment.Length == 0 ? UnknownKey : segment;
    }

    private static Breakdown BuildBreakdown(List<SessionResult> sessions)
    {
        int sameScope = 0, otherTopic = 0, sameTopic = 0, unknown = 0;
        foreach (SessionResult session in sessions)
        {
            switch (session.Second)
            {
                case Relation.SameScope: sameScope++; break;
                case Relation.OtherTopic: otherTopic++; break;
                case Relation.SameTopicDifferentScope: sameTopic++; break;
                case Relation.Unknown: unknown++; break;
            }
        }

        return new Breakdown(sameScope, otherTopic, sameTopic, unknown);
    }

    private static double? Median(IEnumerable<double?> values)
    {
        List<double> sorted = values.Where(value => value is not null).Select(value => value!.Value).OrderBy(value => value).ToList();
        if (sorted.Count == 0)
        {
            return null;
        }

        int middle = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2.0;
    }

    private static double Percent(int part, int whole) => whole == 0 ? 0 : Math.Round(part * 100.0 / whole, 1);

    internal enum Relation
    {
        SameScope,
        OtherTopic,
        SameTopicDifferentScope,
        Unknown,
    }

    internal sealed record EventRow(string SessionId, string EventName, string? RunId, string? ContextType, string? ContextId, DateTime OccurredUtc);

    private sealed record SessionResult(string EntryArea, bool Qualifies, Relation? Second, double? SecondsToFirstAnswer);
}
