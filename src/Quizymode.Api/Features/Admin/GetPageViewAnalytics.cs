using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class GetPageViewAnalytics
{
    public sealed record QueryRequest(
        int Days = 7,
        string? VisitorType = null,
        string? PathContains = null,
        int Page = 1,
        int PageSize = 25,
        int TopPagesLimit = 10);

    public sealed record Response(
        SummaryResponse Summary,
        List<TopPageResponse> TopPages,
        List<RecentPageViewResponse> RecentPageViews,
        int TotalCount,
        int Page,
        int PageSize,
        int TotalPages);

    public sealed record SummaryResponse(
        DateTime WindowStartUtc,
        DateTime WindowEndUtc,
        int TotalPageViews,
        int UniquePages,
        int UniqueSessions,
        int AuthenticatedPageViews,
        int AnonymousPageViews,
        int AuthenticatedSessions,
        int AnonymousSessions);

    public sealed record TopPageResponse(
        string Path,
        int TotalViews,
        int UniqueSessions,
        int AuthenticatedViews,
        int AnonymousViews,
        DateTime LastVisitedUtc);

    public sealed record RecentPageViewResponse(
        string Id,
        string Url,
        string Path,
        string QueryString,
        string SessionId,
        string IpAddress,
        string? Country,
        bool IsAuthenticated,
        string? UserEmail,
        DateTime CreatedUtc);

    private enum VisitorFilter
    {
        All,
        Authenticated,
        Anonymous
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/page-view-analytics", Handler)
                .WithTags("Admin")
                .WithSummary("Get page-view analytics (Admin only)")
                .WithDescription("Returns summary metrics, most visited pages, and recent page hits for anonymous and authenticated traffic.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            int days = 7,
            string? visitorType = null,
            string? pathContains = null,
            int page = 1,
            int pageSize = 25,
            int topPagesLimit = 10,
            ApplicationDbContext db = null!,
            IIpGeolocationService geoService = null!,
            CancellationToken cancellationToken = default)
        {
            QueryRequest request = new(days, visitorType, pathContains, page, pageSize, topPagesLimit);
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
                Error.Validation("Admin.PageViewAnalytics.InvalidDays", "Days must be between 1 and 365."));
        }

        VisitorFilter visitorFilter;
        try
        {
            visitorFilter = ParseVisitorFilter(request.VisitorType);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<Response>(
                Error.Validation("Admin.PageViewAnalytics.InvalidVisitorType", ex.Message));
        }

        int page = Math.Max(1, request.Page);
        int pageSize = Math.Clamp(request.PageSize, 1, 100);
        int topPagesLimit = Math.Clamp(request.TopPagesLimit, 1, 25);
        string? pathContains = string.IsNullOrWhiteSpace(request.PathContains)
            ? null
            : request.PathContains.Trim().ToLowerInvariant();

        DateTime windowEndUtc = DateTime.UtcNow;
        DateTime windowStartUtc = windowEndUtc.AddDays(-request.Days);

        IQueryable<PageView> query = db.PageViews
            .AsNoTracking()
            .Where(pageView => pageView.CreatedUtc >= windowStartUtc && pageView.CreatedUtc <= windowEndUtc);

        query = visitorFilter switch
        {
            VisitorFilter.Authenticated => query.Where(pageView => pageView.IsAuthenticated),
            VisitorFilter.Anonymous => query.Where(pageView => !pageView.IsAuthenticated),
            _ => query
        };

        if (pathContains is not null)
        {
            query = query.Where(pageView => pageView.Path.ToLower().Contains(pathContains));
        }

        int totalCount = await query.CountAsync(cancellationToken);
        int totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);
        int skip = (page - 1) * pageSize;

        SummaryResponse summary = new(
            WindowStartUtc: windowStartUtc,
            WindowEndUtc: windowEndUtc,
            TotalPageViews: totalCount,
            UniquePages: await query.Select(pageView => pageView.Path).Distinct().CountAsync(cancellationToken),
            UniqueSessions: await query.Select(pageView => pageView.SessionId).Distinct().CountAsync(cancellationToken),
            AuthenticatedPageViews: await query.CountAsync(pageView => pageView.IsAuthenticated, cancellationToken),
            AnonymousPageViews: await query.CountAsync(pageView => !pageView.IsAuthenticated, cancellationToken),
            AuthenticatedSessions: await query.Where(pageView => pageView.IsAuthenticated).Select(pageView => pageView.SessionId).Distinct().CountAsync(cancellationToken),
            AnonymousSessions: await query.Where(pageView => !pageView.IsAuthenticated).Select(pageView => pageView.SessionId).Distinct().CountAsync(cancellationToken));

        List<TopPageResponse> topPages = (await query
            .GroupBy(pageView => pageView.Path)
            .Select(group => new
            {
                Path = group.Key,
                TotalViews = group.Count(),
                UniqueSessions = group.Select(pageView => pageView.SessionId).Distinct().Count(),
                AuthenticatedViews = group.Sum(pageView => pageView.IsAuthenticated ? 1 : 0),
                AnonymousViews = group.Sum(pageView => pageView.IsAuthenticated ? 0 : 1),
                LastVisitedUtc = group.Max(pageView => pageView.CreatedUtc)
            })
            .OrderByDescending(page => page.TotalViews)
            .ThenBy(page => page.Path)
            .Take(topPagesLimit)
            .ToListAsync(cancellationToken))
            .Select(page => new TopPageResponse(
                page.Path,
                page.TotalViews,
                page.UniqueSessions,
                page.AuthenticatedViews,
                page.AnonymousViews,
                page.LastVisitedUtc))
            .ToList();

        List<PageView> recentPageViews = await query
            .OrderByDescending(pageView => pageView.CreatedUtc)
            .ThenByDescending(pageView => pageView.Id)
            .Skip(skip)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        List<Guid> userIds = recentPageViews
            .Where(pageView => pageView.UserId.HasValue)
            .Select(pageView => pageView.UserId!.Value)
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

        // Resolve country for unique IPs in this page (parallel, cached)
        List<string> uniqueIps = recentPageViews.Select(pv => pv.IpAddress).Distinct().ToList();
        Dictionary<string, string?> countryByIp = (await Task.WhenAll(
            uniqueIps.Select(async ip => (ip, country: await geoService.GetCountryAsync(ip, cancellationToken)))))
            .ToDictionary(t => t.ip, t => t.country);

        List<RecentPageViewResponse> recentResponses = recentPageViews
            .Select(pageView => new RecentPageViewResponse(
                pageView.Id.ToString(),
                pageView.Url,
                pageView.Path,
                pageView.QueryString,
                pageView.SessionId,
                pageView.IpAddress,
                countryByIp.GetValueOrDefault(pageView.IpAddress),
                pageView.IsAuthenticated,
                pageView.UserId.HasValue && userEmails.TryGetValue(pageView.UserId.Value, out string? email) ? email : null,
                pageView.CreatedUtc))
            .ToList();

        return Result.Success(new Response(summary, topPages, recentResponses, totalCount, page, pageSize, totalPages));
    }

    private static VisitorFilter ParseVisitorFilter(string? visitorType)
    {
        if (string.IsNullOrWhiteSpace(visitorType))
        {
            return VisitorFilter.All;
        }

        return visitorType.Trim().ToLowerInvariant() switch
        {
            "all" => VisitorFilter.All,
            "authenticated" => VisitorFilter.Authenticated,
            "anonymous" => VisitorFilter.Anonymous,
            _ => throw new ArgumentException("VisitorType must be one of: all, authenticated, anonymous.")
        };
    }
}
