using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudySessions;

/// <summary>PROGRESS-001 (#114): the current user's recent sessions and summary. Strictly private; no cross-user view.</summary>
public static class GetStudySessions
{
    public const int DefaultLimit = 20;
    public const int MaxLimit = 50;

    public sealed record SessionsResponse(List<RecordStudySession.SessionDto> Sessions);

    public sealed record SummaryResponse(
        int TotalSessions,
        int TotalQuestions,
        int TotalCorrect,
        int? AccuracyPercent,
        int Last30DaysSessions,
        int? Last30DaysAccuracyPercent,
        int ImportedSessions);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("study-sessions", ListHandler)
                .WithTags("StudySessions")
                .WithSummary("List the current user's recent study sessions")
                .WithDescription("Newest first. limit defaults to 20 and is capped at 50. Requires authentication.")
                .RequireAuthorization()
                .Produces<SessionsResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized);

            app.MapGet("study-sessions/summary", SummaryHandler)
                .WithTags("StudySessions")
                .WithSummary("Summary statistics for the current user's study sessions")
                .WithDescription("Private to the current user; there is no public comparison. Requires authentication.")
                .RequireAuthorization()
                .Produces<SummaryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> ListHandler(
            int? limit,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }
            return Results.Ok(await ListAsync(limit, db, userContext.UserId, cancellationToken));
        }

        private static async Task<IResult> SummaryHandler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }
            return Results.Ok(await SummarizeAsync(db, userContext.UserId, cancellationToken));
        }
    }

    public static async Task<SessionsResponse> ListAsync(int? limit, ApplicationDbContext db, string userId, CancellationToken ct)
    {
        int take = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);
        List<StudySession> sessions = await db.StudySessions.AsNoTracking()
            .Include(s => s.MissedItems)
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CompletedAt)
            .ThenBy(s => s.Id)
            .Take(take)
            .ToListAsync(ct);
        return new SessionsResponse(sessions.Select(RecordStudySession.ToDto).ToList());
    }

    public static async Task<SummaryResponse> SummarizeAsync(ApplicationDbContext db, string userId, CancellationToken ct)
    {
        DateTime since = DateTime.UtcNow.AddDays(-30);
        var rows = await db.StudySessions.AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => new { s.Correct, s.Total, s.CompletedAt, s.Origin })
            .ToListAsync(ct);

        int totalQuestions = rows.Sum(r => r.Total);
        int totalCorrect = rows.Sum(r => r.Correct);
        var recent = rows.Where(r => r.CompletedAt >= since).ToList();
        int recentQuestions = recent.Sum(r => r.Total);
        int recentCorrect = recent.Sum(r => r.Correct);
        return new SummaryResponse(
            rows.Count,
            totalQuestions,
            totalCorrect,
            Percent(totalCorrect, totalQuestions),
            recent.Count,
            Percent(recentCorrect, recentQuestions),
            rows.Count(r => r.Origin == StudySessionOrigins.GuestImport));
    }

    private static int? Percent(int correct, int total) =>
        total == 0 ? null : (int)Math.Round(correct * 100.0 / total, MidpointRounding.AwayFromZero);
}
