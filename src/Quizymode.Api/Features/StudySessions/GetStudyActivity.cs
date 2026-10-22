using System.Globalization;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;

namespace Quizymode.Api.Features.StudySessions;

/// <summary>
/// PROGRESS-002 (#259): per-UTC-day activity for the current user's study sessions (the "My progress" heatmap)
/// plus a study streak. Strictly private: one row per day, never per session, and only the caller's data.
/// </summary>
public static class GetStudyActivity
{
    public const int DefaultDays = 182;
    public const int MinDays = 1;
    public const int MaxDays = RecordStudySession.RetentionDays;

    /// <summary>One UTC day with study activity. <c>HasDaily</c> marks days the daily quiz was completed.</summary>
    public sealed record DayDto(string Date, int Sessions, int Questions, int Correct, bool HasDaily);

    public sealed record Response(string Today, int Days, List<DayDto> Activity, int CurrentStreak, int LongestStreak);

    public sealed class Validator : AbstractValidator<int>
    {
        public Validator()
        {
            RuleFor(days => days).InclusiveBetween(MinDays, MaxDays)
                .WithMessage($"days must be between {MinDays} and {MaxDays}");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("study-sessions/activity", Handler)
                .WithTags("StudySessions")
                .WithSummary("Per-day study activity and streaks for the current user")
                .WithDescription(
                    "One entry per UTC day with activity in the last `days` days (default 182, 1 to 365), plus the current and longest " +
                    "study streak over the retained history. Private to the current user. Requires authentication.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            int? days,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            int window = days ?? DefaultDays;
            var validation = await new Validator().ValidateAsync(window, cancellationToken);
            if (!validation.IsValid)
            {
                return CustomResults.BadRequest(string.Join("; ", validation.Errors.Select(e => e.ErrorMessage)), "Validation failed");
            }

            return Results.Ok(await GetAsync(window, DateTime.UtcNow, db, userContext.UserId, cancellationToken));
        }
    }

    public static async Task<Response> GetAsync(int days, DateTime nowUtc, ApplicationDbContext db, string userId, CancellationToken ct)
    {
        DateOnly today = DateOnly.FromDateTime(nowUtc);
        DateOnly windowStart = today.AddDays(-(days - 1));
        // Streaks look across the whole retained history, so the query always covers the retention window.
        DateOnly historyStart = today.AddDays(-(RecordStudySession.RetentionDays - 1));
        DateTime since = historyStart.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

        var rows = await db.StudySessions.AsNoTracking()
            .Where(s => s.UserId == userId && s.CompletedAt >= since)
            .Select(s => new { s.CompletedAt, s.Total, s.Correct })
            .ToListAsync(ct);

        Dictionary<DateOnly, (int Sessions, int Questions, int Correct)> byDay = rows
            .GroupBy(r => DateOnly.FromDateTime(r.CompletedAt))
            .ToDictionary(g => g.Key, g => (g.Count(), g.Sum(r => r.Total), g.Sum(r => r.Correct)));

        HashSet<DateOnly> dailyDays = (await db.DailyQuizCompletions.AsNoTracking()
                .Where(c => c.UserId == userId && c.Date >= windowStart)
                .Select(c => c.Date)
                .ToListAsync(ct))
            .ToHashSet();

        List<DateOnly> visibleDays = byDay.Keys.Where(d => d >= windowStart && d <= today)
            .Concat(dailyDays.Where(d => d <= today))
            .Distinct()
            .OrderBy(d => d)
            .ToList();

        List<DayDto> activity = visibleDays
            .Select(d =>
            {
                (int sessions, int questions, int correct) = byDay.TryGetValue(d, out var v) ? v : (0, 0, 0);
                return new DayDto(d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), sessions, questions, correct, dailyDays.Contains(d));
            })
            .ToList();

        return new Response(
            today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            days,
            activity,
            DailyQuiz.DailyQuiz.ComputeStreak(byDay.Keys, today),
            ComputeLongestStreak(byDay.Keys));
    }

    /// <summary>Longest run of consecutive days in the set.</summary>
    internal static int ComputeLongestStreak(IEnumerable<DateOnly> activeDays)
    {
        List<DateOnly> sorted = activeDays.Distinct().OrderBy(d => d).ToList();
        int longest = 0;
        int run = 0;
        DateOnly? previous = null;
        foreach (DateOnly day in sorted)
        {
            run = previous is not null && previous.Value.AddDays(1) == day ? run + 1 : 1;
            longest = Math.Max(longest, run);
            previous = day;
        }
        return longest;
    }
}
