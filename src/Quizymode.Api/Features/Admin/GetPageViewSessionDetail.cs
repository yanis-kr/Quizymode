using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

/// <summary>
/// Returns the ordered click path for a single session so an admin can see exactly
/// what one visitor did, rather than inferring it from aggregate counts.
/// </summary>
public static class GetPageViewSessionDetail
{
    public sealed record QueryRequest(string SessionId);

    public sealed record Response(
        string SessionId,
        string Outcome,
        DateTime StartedUtc,
        DateTime EndedUtc,
        int PageHits,
        int DistinctPages,
        int DurationSeconds,
        bool IsBounce,
        string IpAddress,
        string? Country,
        string? UserEmail,
        string? UserAgent,
        bool IsBot,
        List<JourneyStepResponse> Steps);

    public sealed record JourneyStepResponse(
        int StepNumber,
        string Path,
        string QueryString,
        string Url,
        bool IsAuthenticated,
        DateTime CreatedUtc,
        int? DwellSeconds);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/page-view-sessions/{sessionId}", Handler)
                .WithTags("Admin")
                .WithSummary("Get the ordered page journey for one session (Admin only)")
                .WithDescription("Returns every page hit in a session in order, with dwell time per step. The final step has no dwell time because no exit event is recorded.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest)
                .ProducesProblem(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string sessionId,
            ApplicationDbContext db,
            IIpGeolocationService geoService,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(new QueryRequest(sessionId), db, geoService, cancellationToken);

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
        string sessionId = (request.SessionId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return Result.Failure<Response>(
                Error.Validation("Admin.PageViewSessionDetail.InvalidSessionId", "SessionId is required."));
        }

        List<PageView> hits = await db.PageViews
            .AsNoTracking()
            .Where(pageView => pageView.SessionId == sessionId)
            .OrderBy(pageView => pageView.CreatedUtc)
            .ThenBy(pageView => pageView.Id)
            .ToListAsync(cancellationToken);

        if (hits.Count == 0)
        {
            return Result.Failure<Response>(
                Error.NotFound("Admin.PageViewSessionDetail.NotFound", $"No page views were found for session '{sessionId}'."));
        }

        PageView firstHit = hits[0];
        PageView lastHit = hits[^1];

        string outcome = firstHit.IsAuthenticated
            ? GetPageViewSessions.OutcomeAuthenticated
            : hits.Any(hit => hit.IsAuthenticated)
                ? GetPageViewSessions.OutcomeConverted
                : GetPageViewSessions.OutcomeAnonymous;

        List<JourneyStepResponse> steps = hits
            .Select((hit, index) => new JourneyStepResponse(
                StepNumber: index + 1,
                Path: hit.Path,
                QueryString: hit.QueryString,
                Url: hit.Url,
                IsAuthenticated: hit.IsAuthenticated,
                CreatedUtc: hit.CreatedUtc,
                // The last step has no successor and the SPA emits no exit event, so its
                // dwell time is genuinely unknown rather than zero.
                DwellSeconds: index == hits.Count - 1
                    ? null
                    : (int)Math.Round((hits[index + 1].CreatedUtc - hit.CreatedUtc).TotalSeconds)))
            .ToList();

        Guid? userId = hits.LastOrDefault(hit => hit.UserId.HasValue)?.UserId;
        string? userEmail = null;
        if (userId.HasValue)
        {
            userEmail = await db.Users
                .Where(user => user.Id == userId.Value)
                .Select(user => user.Email)
                .FirstOrDefaultAsync(cancellationToken);
        }

        string? country = await geoService.GetCountryAsync(firstHit.IpAddress, cancellationToken);

        return Result.Success(new Response(
            SessionId: sessionId,
            Outcome: outcome,
            StartedUtc: firstHit.CreatedUtc,
            EndedUtc: lastHit.CreatedUtc,
            PageHits: hits.Count,
            DistinctPages: hits.Select(hit => hit.Path).Distinct().Count(),
            DurationSeconds: (int)Math.Round((lastHit.CreatedUtc - firstHit.CreatedUtc).TotalSeconds),
            IsBounce: hits.Count == 1,
            IpAddress: firstHit.IpAddress,
            Country: country,
            UserEmail: userEmail,
            UserAgent: firstHit.UserAgent,
            IsBot: firstHit.IsBot,
            Steps: steps));
    }
}
