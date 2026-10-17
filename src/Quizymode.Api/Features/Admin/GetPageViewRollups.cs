using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

/// <summary>
/// Long-range traffic trends read from daily rollups instead of raw page hits (ANALYTICS-011). Raw
/// hits are kept for <see cref="PageViewRetentionService.RetentionDays"/> days; this report covers up
/// to two years. Rollups exclude bots and internal sessions, so there are no include toggles.
/// </summary>
public static class GetPageViewRollups
{
    public const int MaxDays = 730;

    public sealed record QueryRequest(int Days = 365);

    /// <param name="LatestRolledDay">Most recent UTC day with rollup rows; null when nothing has been rolled up yet.</param>
    /// <param name="TotalSessionDays">Sum of each day's distinct sessions; a session spanning midnight counts once per day.</param>
    public sealed record Response(
        DateOnly WindowStartDay,
        DateOnly WindowEndDay,
        int RetentionDays,
        DateOnly? LatestRolledDay,
        int TotalHits,
        int TotalSessionDays,
        int TotalBouncedSessionDays,
        int TotalItemSteps,
        List<DailyRow> Daily,
        List<AreaRow> Areas,
        List<DimensionRow> Channels,
        List<DimensionRow> DeviceClasses,
        List<DimensionRow> Outcomes,
        List<DimensionRow> VisitorTypes,
        List<ScopeRow> TopScopes);

    /// <summary>Hits and item steps per category or collection (sessions are not additive across areas, so not reported).</summary>
    public sealed record ScopeRow(string ScopeType, string ScopeKey, int Hits, int ItemSteps);

    public sealed record DailyRow(DateOnly Day, int Sessions, int Hits, int ItemSteps);

    /// <param name="SessionDays">Sum over days of the distinct sessions that touched this area that day.</param>
    public sealed record AreaRow(string Area, int Hits, int SessionDays, int ItemSteps);

    public sealed record DimensionRow(string Value, int SessionDays, int Hits);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/page-view-rollups", Handler)
                .WithTags("Admin")
                .WithSummary("Get long-range page-view trends from daily rollups (Admin only)")
                .WithDescription("Returns daily sessions and hits plus totals by feature area, channel, device class, outcome, and new versus returning visitors for up to 730 days, read from daily rollups (bots and internal sessions excluded). Raw page hits are kept for 180 days; use this report for longer ranges.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            int days = 365,
            ApplicationDbContext db = null!,
            CancellationToken cancellationToken = default)
        {
            Result<Response> result = await HandleAsync(new QueryRequest(days), db, DateTime.UtcNow, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        if (request.Days is < 1 or > MaxDays)
        {
            return Result.Failure<Response>(
                Error.Validation("Admin.PageViewRollups.InvalidDays", $"Days must be between 1 and {MaxDays}."));
        }

        // Rollups cover complete UTC days only, so the window ends yesterday.
        DateOnly windowEndDay = DateOnly.FromDateTime(nowUtc).AddDays(-1);
        DateOnly windowStartDay = windowEndDay.AddDays(-(request.Days - 1));

        List<PageViewDailyRollup> rows = await db.PageViewDailyRollups
            .AsNoTracking()
            .Where(rollup => rollup.Day >= windowStartDay && rollup.Day <= windowEndDay)
            .ToListAsync(cancellationToken);

        DateOnly? latestRolledDay = await db.PageViewDailyRollups.AnyAsync(cancellationToken)
            ? await db.PageViewDailyRollups.MaxAsync(rollup => rollup.Day, cancellationToken)
            : null;

        // Session-level figures come from the "all" rows so a session touching several areas is not
        // counted once per area.
        List<PageViewDailyRollup> totals = rows.Where(row => row.Area == PageViewRetentionService.AreaAll).ToList();
        List<PageViewDailyRollup> areaTotals = rows
            .Where(row => row.Area != PageViewRetentionService.AreaAll && row.ScopeType == PageViewRetentionService.ScopeAll)
            .ToList();
        List<PageViewDailyRollup> scopeRows = rows
            .Where(row => row.Area != PageViewRetentionService.AreaAll &&
                row.ScopeType != null &&
                row.ScopeType != PageViewRetentionService.ScopeAll &&
                row.ScopeKey != null)
            .ToList();

        List<DailyRow> daily = totals
            .GroupBy(row => row.Day)
            .Select(group => new DailyRow(group.Key, group.Sum(row => row.Sessions), group.Sum(row => row.Hits), group.Sum(row => row.ItemSteps)))
            .OrderBy(row => row.Day)
            .ToList();

        List<AreaRow> areas = areaTotals
            .GroupBy(row => row.Area, StringComparer.Ordinal)
            .Select(group => new AreaRow(group.Key, group.Sum(row => row.Hits), group.Sum(row => row.Sessions), group.Sum(row => row.ItemSteps)))
            .OrderByDescending(row => row.SessionDays)
            .ThenBy(row => row.Area, StringComparer.Ordinal)
            .ToList();

        return Result.Success(new Response(
            windowStartDay,
            windowEndDay,
            PageViewRetentionService.RetentionDays,
            latestRolledDay,
            TotalHits: totals.Sum(row => row.Hits),
            TotalSessionDays: totals.Sum(row => row.Sessions),
            TotalBouncedSessionDays: totals.Sum(row => row.BouncedSessions),
            TotalItemSteps: totals.Sum(row => row.ItemSteps),
            daily,
            areas,
            Dimension(totals, row => row.Channel),
            Dimension(totals, row => row.DeviceClass),
            Dimension(totals, row => row.Outcome),
            Dimension(totals, row => row.VisitorType),
            scopeRows
                .GroupBy(row => (row.ScopeType!, row.ScopeKey!))
                .Select(group => new ScopeRow(group.Key.Item1, group.Key.Item2, group.Sum(row => row.Hits), group.Sum(row => row.ItemSteps)))
                .OrderByDescending(row => row.Hits)
                .ThenBy(row => row.ScopeType, StringComparer.Ordinal)
                .ThenBy(row => row.ScopeKey, StringComparer.Ordinal)
                .Take(25)
                .ToList()));
    }

    private static List<DimensionRow> Dimension(List<PageViewDailyRollup> totals, Func<PageViewDailyRollup, string> selector) =>
        totals
            .GroupBy(selector, StringComparer.Ordinal)
            .Select(group => new DimensionRow(group.Key, group.Sum(row => row.Sessions), group.Sum(row => row.Hits)))
            .OrderByDescending(row => row.SessionDays)
            .ThenBy(row => row.Value, StringComparer.Ordinal)
            .ToList();
}
