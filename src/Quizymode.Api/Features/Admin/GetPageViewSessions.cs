using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

/// <summary>
/// Rolls raw page hits up into sessions so admins can tell a visitor who glanced at one
/// page and left from one who stayed and moved through the app.
/// </summary>
public static class GetPageViewSessions
{
    /// <summary>Materializing more sessions than this in memory is refused; narrow the window instead.</summary>
    private const int MaxSessionsAnalyzed = 50_000;

    public sealed record QueryRequest(
        int Days = 7,
        string? Outcome = null,
        int? MinPages = null,
        bool IncludeBots = false,
        string? SortBy = null,
        int Page = 1,
        int PageSize = 25,
        int LandingPagesLimit = 10);

    public sealed record Response(
        SummaryResponse Summary,
        List<DepthBucketResponse> DepthBuckets,
        List<LandingPageResponse> LandingPages,
        List<SessionResponse> Sessions,
        int TotalCount,
        int Page,
        int PageSize,
        int TotalPages);

    public sealed record SummaryResponse(
        DateTime WindowStartUtc,
        DateTime WindowEndUtc,
        int TotalSessions,
        int TotalPageHits,
        int BouncedSessions,
        double BounceRatePercent,
        int EngagedSessions,
        double AvgPagesPerSession,
        double AvgDurationSecondsEngaged,
        double MedianDurationSecondsEngaged,
        int BotSessions,
        bool BotsExcluded,
        List<OutcomeStatsResponse> ByOutcome);

    public sealed record OutcomeStatsResponse(
        string Outcome,
        int Sessions,
        int BouncedSessions,
        double BounceRatePercent,
        int EngagedSessions,
        double AvgPagesPerSession);

    public sealed record DepthBucketResponse(
        string Label,
        int TotalSessions,
        int AnonymousSessions,
        int ConvertedSessions,
        int AuthenticatedSessions);

    public sealed record LandingPageResponse(
        string Path,
        int Sessions,
        int BouncedSessions,
        double BounceRatePercent,
        double AvgPagesPerSession);

    public sealed record SessionResponse(
        string SessionId,
        string Outcome,
        DateTime StartedUtc,
        DateTime EndedUtc,
        int PageHits,
        int DistinctPages,
        int DurationSeconds,
        bool IsBounce,
        string EntryPath,
        string ExitPath,
        string IpAddress,
        string? Country,
        string? UserEmail,
        string? UserAgent,
        bool IsBot);

    private enum OutcomeFilter
    {
        All,
        Anonymous,
        Converted,
        Authenticated
    }

    private enum SessionSort
    {
        Recent,
        Pages,
        Duration
    }

    public const string OutcomeAnonymous = "anonymous";
    public const string OutcomeConverted = "converted";
    public const string OutcomeAuthenticated = "authenticated";

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/page-view-sessions", Handler)
                .WithTags("Admin")
                .WithSummary("Get session-level page-view engagement (Admin only)")
                .WithDescription("Groups page hits into sessions and reports bounce rate, session depth, landing pages, and per-session journeys split by anonymous, converted, and authenticated visitors.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            int days = 7,
            string? outcome = null,
            int? minPages = null,
            bool includeBots = false,
            string? sortBy = null,
            int page = 1,
            int pageSize = 25,
            int landingPagesLimit = 10,
            ApplicationDbContext db = null!,
            IIpGeolocationService geoService = null!,
            CancellationToken cancellationToken = default)
        {
            QueryRequest request = new(days, outcome, minPages, includeBots, sortBy, page, pageSize, landingPagesLimit);
            Result<Response> result = await HandleAsync(request, db, geoService, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        IIpGeolocationService geoService,
        CancellationToken cancellationToken)
    {
        if (request.Days is < 1 or > 365)
        {
            return Result.Failure<Response>(
                Error.Validation("Admin.PageViewSessions.InvalidDays", "Days must be between 1 and 365."));
        }

        OutcomeFilter outcomeFilter;
        SessionSort sort;
        try
        {
            outcomeFilter = ParseOutcomeFilter(request.Outcome);
            sort = ParseSort(request.SortBy);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<Response>(
                Error.Validation("Admin.PageViewSessions.InvalidFilter", ex.Message));
        }

        int page = Math.Max(1, request.Page);
        int pageSize = Math.Clamp(request.PageSize, 1, 100);
        int landingPagesLimit = Math.Clamp(request.LandingPagesLimit, 1, 25);
        int minPages = Math.Clamp(request.MinPages ?? 1, 1, 100);

        DateTime windowEndUtc = DateTime.UtcNow;
        DateTime windowStartUtc = windowEndUtc.AddDays(-request.Days);

        IQueryable<PageView> windowQuery = db.PageViews
            .AsNoTracking()
            .Where(pageView => pageView.CreatedUtc >= windowStartUtc && pageView.CreatedUtc <= windowEndUtc);

        // Bot sessions are reported even when excluded: the gap between the two numbers is
        // usually the explanation for anonymous traffic looking like one-off page checks.
        int botSessions = await windowQuery
            .Where(pageView => pageView.IsBot)
            .Select(pageView => pageView.SessionId)
            .Distinct()
            .CountAsync(cancellationToken);

        IQueryable<PageView> baseQuery = request.IncludeBots
            ? windowQuery
            : windowQuery.Where(pageView => !pageView.IsBot);

        int sessionCount = await baseQuery
            .Select(pageView => pageView.SessionId)
            .Distinct()
            .CountAsync(cancellationToken);

        if (sessionCount > MaxSessionsAnalyzed)
        {
            return Result.Failure<Response>(
                Error.Validation(
                    "Admin.PageViewSessions.WindowTooLarge",
                    $"The selected window contains {sessionCount} sessions, which exceeds the {MaxSessionsAnalyzed} session analysis limit. Select a shorter time range."));
        }

        // Q1: one row per session. Count(Distinct) inside GroupBy translates on both
        // Npgsql and the SQLite provider used by the test fixture.
        var aggregates = await baseQuery
            .GroupBy(pageView => pageView.SessionId)
            .Select(group => new
            {
                SessionId = group.Key,
                FirstSeenUtc = group.Min(pageView => pageView.CreatedUtc),
                LastSeenUtc = group.Max(pageView => pageView.CreatedUtc),
                PageHits = group.Count(),
                DistinctPages = group.Select(pageView => pageView.Path).Distinct().Count(),
                AuthHits = group.Sum(pageView => pageView.IsAuthenticated ? 1 : 0)
            })
            .ToListAsync(cancellationToken);

        // Q2: the first and last hit of every session, for entry/exit path and the auth
        // state the outcome classification is based on.
        var boundaryTimes = baseQuery
            .GroupBy(pageView => pageView.SessionId)
            .Select(group => new
            {
                SessionId = group.Key,
                FirstUtc = group.Min(pageView => pageView.CreatedUtc),
                LastUtc = group.Max(pageView => pageView.CreatedUtc)
            });

        var boundaryRows = await (
            from pageView in baseQuery
            join boundary in boundaryTimes on pageView.SessionId equals boundary.SessionId
            where pageView.CreatedUtc == boundary.FirstUtc || pageView.CreatedUtc == boundary.LastUtc
            select new
            {
                pageView.Id,
                pageView.SessionId,
                pageView.Path,
                pageView.CreatedUtc,
                pageView.IsAuthenticated,
                pageView.UserId,
                pageView.IpAddress,
                pageView.UserAgent,
                pageView.IsBot,
                boundary.FirstUtc,
                boundary.LastUtc
            }).ToListAsync(cancellationToken);

        // Two hits sharing a timestamp inside one session would otherwise produce duplicate
        // boundary rows; ordering by Id makes the pick deterministic.
        Dictionary<string, Boundary> boundaries = boundaryRows
            .GroupBy(row => row.SessionId)
            .ToDictionary(
                group => group.Key,
                group =>
                {
                    var entry = group.Where(row => row.CreatedUtc == row.FirstUtc)
                        .OrderBy(row => row.Id)
                        .First();
                    var exit = group.Where(row => row.CreatedUtc == row.LastUtc)
                        .OrderBy(row => row.Id)
                        .Last();

                    return new Boundary(
                        EntryPath: entry.Path,
                        ExitPath: exit.Path,
                        EntryAuthenticated: entry.IsAuthenticated,
                        UserId: exit.UserId ?? entry.UserId,
                        IpAddress: entry.IpAddress,
                        UserAgent: entry.UserAgent,
                        IsBot: entry.IsBot);
                });

        List<SessionRow> sessions = aggregates
            .Where(aggregate => boundaries.ContainsKey(aggregate.SessionId))
            .Select(aggregate =>
            {
                Boundary boundary = boundaries[aggregate.SessionId];

                string outcome = boundary.EntryAuthenticated
                    ? OutcomeAuthenticated
                    : aggregate.AuthHits > 0
                        ? OutcomeConverted
                        : OutcomeAnonymous;

                return new SessionRow(
                    SessionId: aggregate.SessionId,
                    Outcome: outcome,
                    StartedUtc: aggregate.FirstSeenUtc,
                    EndedUtc: aggregate.LastSeenUtc,
                    PageHits: aggregate.PageHits,
                    DistinctPages: aggregate.DistinctPages,
                    DurationSeconds: (int)Math.Round((aggregate.LastSeenUtc - aggregate.FirstSeenUtc).TotalSeconds),
                    Boundary: boundary);
            })
            .ToList();

        SummaryResponse summary = BuildSummary(
            windowStartUtc,
            windowEndUtc,
            sessions,
            botSessions,
            botsExcluded: !request.IncludeBots);

        List<DepthBucketResponse> depthBuckets = BuildDepthBuckets(sessions);
        List<LandingPageResponse> landingPages = BuildLandingPages(sessions, landingPagesLimit);

        // Outcome and minPages narrow the session list only; the summary, histogram, and
        // landing pages always describe the whole window so the denominators stay stable.
        List<SessionRow> filtered = sessions
            .Where(session => outcomeFilter switch
            {
                OutcomeFilter.Anonymous => session.Outcome == OutcomeAnonymous,
                OutcomeFilter.Converted => session.Outcome == OutcomeConverted,
                OutcomeFilter.Authenticated => session.Outcome == OutcomeAuthenticated,
                _ => true
            })
            .Where(session => session.PageHits >= minPages)
            .ToList();

        filtered = sort switch
        {
            SessionSort.Pages => filtered
                .OrderByDescending(session => session.PageHits)
                .ThenByDescending(session => session.StartedUtc)
                .ToList(),
            SessionSort.Duration => filtered
                .OrderByDescending(session => session.DurationSeconds)
                .ThenByDescending(session => session.StartedUtc)
                .ToList(),
            _ => filtered
                .OrderByDescending(session => session.StartedUtc)
                .ThenBy(session => session.SessionId, StringComparer.Ordinal)
                .ToList()
        };

        int totalCount = filtered.Count;
        int totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);
        List<SessionRow> pageRows = filtered
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        // Resolve emails and countries for the visible page only.
        List<Guid> userIds = pageRows
            .Where(session => session.Boundary.UserId.HasValue)
            .Select(session => session.Boundary.UserId!.Value)
            .Distinct()
            .ToList();

        Dictionary<Guid, string?> userEmails = new();
        if (userIds.Count > 0)
        {
            userEmails = await db.Users
                .Where(user => userIds.Contains(user.Id))
                .Select(user => new { user.Id, user.Email })
                .ToDictionaryAsync(user => user.Id, user => user.Email, cancellationToken);
        }

        List<string> uniqueIps = pageRows.Select(session => session.Boundary.IpAddress).Distinct().ToList();
        Dictionary<string, string?> countryByIp = (await Task.WhenAll(
            uniqueIps.Select(async ip => (ip, country: await geoService.GetCountryAsync(ip, cancellationToken)))))
            .ToDictionary(entry => entry.ip, entry => entry.country);

        List<SessionResponse> sessionResponses = pageRows
            .Select(session => new SessionResponse(
                session.SessionId,
                session.Outcome,
                session.StartedUtc,
                session.EndedUtc,
                session.PageHits,
                session.DistinctPages,
                session.DurationSeconds,
                session.PageHits == 1,
                session.Boundary.EntryPath,
                session.Boundary.ExitPath,
                session.Boundary.IpAddress,
                countryByIp.GetValueOrDefault(session.Boundary.IpAddress),
                session.Boundary.UserId.HasValue && userEmails.TryGetValue(session.Boundary.UserId.Value, out string? email)
                    ? email
                    : null,
                session.Boundary.UserAgent,
                session.Boundary.IsBot))
            .ToList();

        return Result.Success(new Response(
            summary,
            depthBuckets,
            landingPages,
            sessionResponses,
            totalCount,
            page,
            pageSize,
            totalPages));
    }

    private static SummaryResponse BuildSummary(
        DateTime windowStartUtc,
        DateTime windowEndUtc,
        List<SessionRow> sessions,
        int botSessions,
        bool botsExcluded)
    {
        int totalSessions = sessions.Count;
        int totalPageHits = sessions.Sum(session => session.PageHits);
        int bounced = sessions.Count(session => session.PageHits == 1);
        int engaged = sessions.Count(session => session.DistinctPages >= 2);

        // Bounces always have a zero duration (there is no exit event), so including them
        // would drag the average toward zero and hide real dwell time.
        List<int> engagedDurations = sessions
            .Where(session => session.PageHits > 1)
            .Select(session => session.DurationSeconds)
            .OrderBy(seconds => seconds)
            .ToList();

        List<OutcomeStatsResponse> byOutcome = new[] { OutcomeAnonymous, OutcomeConverted, OutcomeAuthenticated }
            .Select(outcome =>
            {
                List<SessionRow> group = sessions.Where(session => session.Outcome == outcome).ToList();
                int groupBounced = group.Count(session => session.PageHits == 1);

                return new OutcomeStatsResponse(
                    outcome,
                    group.Count,
                    groupBounced,
                    Percent(groupBounced, group.Count),
                    group.Count(session => session.DistinctPages >= 2),
                    group.Count == 0 ? 0 : Math.Round(group.Average(session => session.PageHits), 2));
            })
            .ToList();

        return new SummaryResponse(
            WindowStartUtc: windowStartUtc,
            WindowEndUtc: windowEndUtc,
            TotalSessions: totalSessions,
            TotalPageHits: totalPageHits,
            BouncedSessions: bounced,
            BounceRatePercent: Percent(bounced, totalSessions),
            EngagedSessions: engaged,
            AvgPagesPerSession: totalSessions == 0 ? 0 : Math.Round(totalPageHits / (double)totalSessions, 2),
            AvgDurationSecondsEngaged: engagedDurations.Count == 0 ? 0 : Math.Round(engagedDurations.Average(), 1),
            MedianDurationSecondsEngaged: Median(engagedDurations),
            BotSessions: botSessions,
            BotsExcluded: botsExcluded,
            ByOutcome: byOutcome);
    }

    private static List<DepthBucketResponse> BuildDepthBuckets(List<SessionRow> sessions)
    {
        (string Label, int Min, int Max)[] buckets =
        [
            ("1 page", 1, 1),
            ("2 pages", 2, 2),
            ("3-5 pages", 3, 5),
            ("6-10 pages", 6, 10),
            ("11+ pages", 11, int.MaxValue)
        ];

        return buckets
            .Select(bucket =>
            {
                List<SessionRow> group = sessions
                    .Where(session => session.PageHits >= bucket.Min && session.PageHits <= bucket.Max)
                    .ToList();

                return new DepthBucketResponse(
                    bucket.Label,
                    group.Count,
                    group.Count(session => session.Outcome == OutcomeAnonymous),
                    group.Count(session => session.Outcome == OutcomeConverted),
                    group.Count(session => session.Outcome == OutcomeAuthenticated));
            })
            .ToList();
    }

    private static List<LandingPageResponse> BuildLandingPages(List<SessionRow> sessions, int limit)
    {
        return sessions
            .GroupBy(session => session.Boundary.EntryPath)
            .Select(group =>
            {
                int bounced = group.Count(session => session.PageHits == 1);

                return new LandingPageResponse(
                    group.Key,
                    group.Count(),
                    bounced,
                    Percent(bounced, group.Count()),
                    Math.Round(group.Average(session => session.PageHits), 2));
            })
            .OrderByDescending(landing => landing.Sessions)
            .ThenBy(landing => landing.Path, StringComparer.Ordinal)
            .Take(limit)
            .ToList();
    }

    private static double Percent(int part, int total)
    {
        return total == 0 ? 0 : Math.Round(part * 100.0 / total, 1);
    }

    private static double Median(List<int> sortedValues)
    {
        if (sortedValues.Count == 0)
        {
            return 0;
        }

        int middle = sortedValues.Count / 2;

        return sortedValues.Count % 2 == 1
            ? sortedValues[middle]
            : Math.Round((sortedValues[middle - 1] + sortedValues[middle]) / 2.0, 1);
    }

    private static OutcomeFilter ParseOutcomeFilter(string? outcome)
    {
        if (string.IsNullOrWhiteSpace(outcome))
        {
            return OutcomeFilter.All;
        }

        return outcome.Trim().ToLowerInvariant() switch
        {
            "all" => OutcomeFilter.All,
            OutcomeAnonymous => OutcomeFilter.Anonymous,
            OutcomeConverted => OutcomeFilter.Converted,
            OutcomeAuthenticated => OutcomeFilter.Authenticated,
            _ => throw new ArgumentException("Outcome must be one of: all, anonymous, converted, authenticated.")
        };
    }

    private static SessionSort ParseSort(string? sortBy)
    {
        if (string.IsNullOrWhiteSpace(sortBy))
        {
            return SessionSort.Recent;
        }

        return sortBy.Trim().ToLowerInvariant() switch
        {
            "recent" => SessionSort.Recent,
            "pages" => SessionSort.Pages,
            "duration" => SessionSort.Duration,
            _ => throw new ArgumentException("SortBy must be one of: recent, pages, duration.")
        };
    }

    private sealed record Boundary(
        string EntryPath,
        string ExitPath,
        bool EntryAuthenticated,
        Guid? UserId,
        string IpAddress,
        string? UserAgent,
        bool IsBot);

    private sealed record SessionRow(
        string SessionId,
        string Outcome,
        DateTime StartedUtc,
        DateTime EndedUtc,
        int PageHits,
        int DistinctPages,
        int DurationSeconds,
        Boundary Boundary);
}
