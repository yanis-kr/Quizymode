using Quizymode.Api.Shared.Helpers;
using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.DailyQuiz;

/// <summary>
/// DAILY-001 (#119): one global daily quiz per UTC date. The set is chosen deterministically from the date seed the
/// first time the day is read and then stored, so every visitor gets the same items and an admin can replace one.
/// #645: the five positions are curated slots (0 picture, 1 geography or history, 2 science or nature, 3 trivia with
/// brain teasers first, 4 wildcard from a category the other slots did not use) drawn from a pool of short, general-interest
/// items. An admin exclude replaces the item with the top seed-ranked candidate of the same slot (the position maps to the
/// slot, also for sets stored before the slots existed). With fewer than five eligible items the day falls back to the
/// whole-catalog seed order.
/// </summary>
public static class DailyQuiz
{
    public const int SetSize = 5;
    public const int RepeatWindowDays = 30;
    public const int MaxAdminDaysAhead = 7;
    public const int ArchiveDays = 7;
    /// <summary>#677: the first curated set; earlier stored sets are never served by the archive.</summary>
    public static readonly DateOnly ArchiveStartDate = new(2026, 11, 15);
    private const int MaxStreakLookbackDays = 400;
    private const string LoggerCategory = "Quizymode.DailyQuiz";

    /// <summary>Lower-case category names the curated pool draws from (compared lower-cased, in SQL and in memory).</summary>
    internal static readonly string[] AllowedCategories = ["geography", "history", "trivia", "science", "nature", "humanities", "sports", "civics"];
    internal const int MaxQuestionChars = 140;
    internal const int MaxAnswerChars = 40;
    internal const int MinDistractors = 3;
    private const string BrainTeasersKeyword = "brain-teasers";

    /// <summary>Position 0 to 4 in the stored set maps to these slots, in order.</summary>
    internal enum DailySlot { Picture, GeoHistory, SciNature, Trivia, Wildcard }

    /// <summary>One item of the SQL-prefiltered pool; <see cref="Category"/> is lower-cased.</summary>
    internal sealed record DailyCandidateRow(
        Guid Id,
        string Category,
        bool HasPicture,
        bool IsBrainTeaser,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation);

    /// <summary>One chosen item. FallbackReason is null when the slot's own pool supplied it.</summary>
    internal sealed record DailyPick(Guid ItemId, DailySlot Slot, string? FallbackReason);

    /// <summary>Picks is empty when LegacyFallback is true (fewer than five eligible items for the date).</summary>
    internal sealed record DailySelection(DateOnly Date, IReadOnlyList<DailyPick> Picks, bool LegacyFallback);

    public sealed record CompletionDto(int Correct, int Total, DateTime CompletedAt, int Skipped = 0);

    /// <param name="Date">The UTC calendar date of the set, yyyy-MM-dd.</param>
    /// <param name="Items">The day's active items in slot order.</param>
    /// <param name="Completion">The caller's completion for this date; always null for anonymous callers.</param>
    /// <param name="Streak">Consecutive UTC days with a completion; null for anonymous callers (they keep it in the browser).</param>
    public sealed record DailyQuizResponse(
        string Date,
        List<GetItems.ItemResponse> Items,
        CompletionDto? Completion,
        int? Streak);

    /// <param name="Date">The archived UTC date, yyyy-MM-dd.</param>
    /// <param name="Total">The number of active items in that day's stored set.</param>
    /// <param name="Completion">The caller's completion for that date; always null for anonymous callers.</param>
    public sealed record ArchiveEntryDto(string Date, int Total, CompletionDto? Completion);

    public sealed record ArchiveResponse(List<ArchiveEntryDto> Days);

    // Skipped: questions skipped because their picture was unavailable (#403); they are not scored. Defaults to 0.
    public sealed record CompleteRequest(string Date, int Correct, int Total, int Skipped = 0);

    public sealed record CompleteResponse(bool Created, int Streak, CompletionDto Completion);

    public sealed record AdminItemDto(Guid ItemId, int Position, string Question, string? Category, bool Excluded, DateTime? ExcludedAt, ItemImageReference? QuestionImage = null);

    public sealed record AdminDayResponse(string Date, List<AdminItemDto> Items);

    public sealed class CompleteValidator : AbstractValidator<CompleteRequest>
    {
        public CompleteValidator()
        {
            RuleFor(x => x.Date).Must(d => TryParseDate(d, out _)).WithMessage("Date must be yyyy-MM-dd");
            RuleFor(x => x.Total).InclusiveBetween(1, SetSize);
            RuleFor(x => x.Skipped).GreaterThanOrEqualTo(0).LessThanOrEqualTo(x => x.Total);
            RuleFor(x => x.Correct).GreaterThanOrEqualTo(0).LessThanOrEqualTo(x => x.Total - x.Skipped);
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("daily-quiz", GetHandler)
                .WithTags("DailyQuiz")
                .WithSummary("Get today's daily quiz")
                .WithDescription("Today's (UTC) global set of up to 5 public items. Signed-in callers also get their completion for the day and streak. With date=yyyy-MM-dd (one of the 7 days before today, never before 2026-11-15) the stored set of that day is returned for archive play: other dates return 400, a day without a stored set 404, and nothing is created.")
                .AllowAnonymous()
                .Produces<DailyQuizResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);

            app.MapGet("daily-quiz/archive", ArchiveHandler)
                .WithTags("DailyQuiz")
                .WithSummary("List the stored daily quiz sets of the last 7 days")
                .WithDescription("Stored sets for the 7 UTC days before today (never before 2026-11-15), newest first. Past sets are never created. Signed-in callers also get their completion per date.")
                .AllowAnonymous()
                .Produces<ArchiveResponse>(StatusCodes.Status200OK);

            app.MapPost("daily-quiz/completions", CompleteHandler)
                .WithTags("DailyQuiz")
                .WithSummary("Record the current user's daily quiz completion")
                .WithDescription("Date must be today or yesterday (UTC) so a run that crosses midnight still counts. First write wins. Requires authentication.")
                .RequireAuthorization()
                .Produces<CompleteResponse>(StatusCodes.Status200OK)
                .Produces<CompleteResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized);

            app.MapGet("admin/daily-quiz", AdminGetHandler)
                .WithTags("Admin")
                .WithSummary("Get a day's daily quiz set (Admin only)")
                .WithDescription("date is yyyy-MM-dd from today to 7 days ahead (UTC), default today; the set is created if missing. Lists active and excluded items.")
                .RequireAuthorization("Admin")
                .Produces<AdminDayResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);

            app.MapPost("admin/daily-quiz/{date}/items/{itemId:guid}/exclude", AdminExcludeHandler)
                .WithTags("Admin")
                .WithSummary("Remove an item from a day's daily quiz (Admin only)")
                .WithDescription("Marks the item excluded for that date and fills its slot (position 0 picture, 1 geography or history, 2 science or nature, 3 trivia, 4 wildcard) with the top seed-ranked eligible item of that same slot. Completions already recorded keep their streak credit.")
                .RequireAuthorization("Admin")
                .Produces<AdminDayResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict);
        }

        private static async Task<IResult> ArchiveHandler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            return Results.Ok(await ListArchiveAsync(db, userContext, DateTime.UtcNow, cancellationToken));
        }

        private static async Task<IResult> GetHandler(
            ApplicationDbContext db,
            IUserContext userContext,
            ILoggerFactory loggerFactory,
            CancellationToken cancellationToken,
            string? date = null)
        {
            if (date is not null)
            {
                Result<DailyQuizResponse> archived = await GetArchiveDayAsync(date, db, userContext, DateTime.UtcNow, cancellationToken);
                return archived.Match(Results.Ok, _ => CustomResults.Problem(archived));
            }

            return Results.Ok(await GetAsync(db, userContext, DateTime.UtcNow, cancellationToken, loggerFactory.CreateLogger(LoggerCategory)));
        }

        private static async Task<IResult> CompleteHandler(
            CompleteRequest request,
            IValidator<CompleteRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            var validation = await validator.ValidateAsync(request, cancellationToken);
            if (!validation.IsValid)
            {
                return CustomResults.BadRequest(string.Join("; ", validation.Errors.Select(e => e.ErrorMessage)), "Validation failed");
            }

            Result<CompleteResponse> result = await CompleteAsync(request, db, userContext.UserId, DateTime.UtcNow, cancellationToken);
            return result.Match(
                value => value.Created ? Results.Created("/api/daily-quiz", value) : Results.Ok(value),
                _ => CustomResults.Problem(result));
        }

        private static async Task<IResult> AdminGetHandler(
            string? date,
            ApplicationDbContext db,
            ILoggerFactory loggerFactory,
            CancellationToken cancellationToken)
        {
            Result<AdminDayResponse> result = await AdminGetAsync(date, db, DateTime.UtcNow, cancellationToken, loggerFactory.CreateLogger(LoggerCategory));
            return result.Match(Results.Ok, _ => CustomResults.Problem(result));
        }

        private static async Task<IResult> AdminExcludeHandler(
            string date,
            Guid itemId,
            ApplicationDbContext db,
            IUserContext userContext,
            ILoggerFactory loggerFactory,
            CancellationToken cancellationToken)
        {
            Result<AdminDayResponse> result = await ExcludeAsync(date, itemId, db, userContext.UserId ?? "admin", DateTime.UtcNow, cancellationToken, loggerFactory.CreateLogger(LoggerCategory));
            return result.Match(Results.Ok, _ => CustomResults.Problem(result));
        }
    }

    public static async Task<DailyQuizResponse> GetAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        DateTime nowUtc,
        CancellationToken cancellationToken,
        ILogger? logger = null)
    {
        DateOnly today = DateOnly.FromDateTime(nowUtc);
        List<DailyQuizItem> set = await EnsureSetAsync(db, today, cancellationToken, logger);
        return await BuildResponseAsync(db, userContext, today, today, set, cancellationToken);
    }

    /// <summary>#677: the stored set of one of the last 7 days. Never creates a set; archive play never writes a completion.</summary>
    public static async Task<Result<DailyQuizResponse>> GetArchiveDayAsync(
        string dateText,
        ApplicationDbContext db,
        IUserContext userContext,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        DateOnly today = DateOnly.FromDateTime(nowUtc);
        (DateOnly from, DateOnly to) = ArchiveWindow(today);
        if (!TryParseDate(dateText, out DateOnly date) || date < from || date > to)
        {
            return Result.Failure<DailyQuizResponse>(
                Error.Validation("DailyQuiz.InvalidArchiveDate", "Only the stored daily quizzes of the last 7 days (UTC, not before 2026-11-15) can be played from the archive."));
        }

        if (!await db.DailyQuizSets.AsNoTracking().AnyAsync(s => s.Date == date, cancellationToken))
        {
            return Result.Failure<DailyQuizResponse>(
                Error.NotFound("DailyQuiz.ArchiveSetNotFound", "No daily quiz was stored for that date."));
        }

        List<DailyQuizItem> set = await db.DailyQuizItems.AsNoTracking().Where(d => d.Date == date).ToListAsync(cancellationToken);
        return Result.Success(await BuildResponseAsync(db, userContext, date, today, set, cancellationToken));
    }

    public static async Task<ArchiveResponse> ListArchiveAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        DateOnly today = DateOnly.FromDateTime(nowUtc);
        (DateOnly from, DateOnly to) = ArchiveWindow(today);
        if (from > to)
        {
            return new ArchiveResponse(new List<ArchiveEntryDto>());
        }

        List<DateOnly> dates = await db.DailyQuizSets.AsNoTracking()
            .Where(s => s.Date >= from && s.Date <= to)
            .Select(s => s.Date)
            .ToListAsync(cancellationToken);
        Dictionary<DateOnly, int> totals = (await db.DailyQuizItems.AsNoTracking()
                .Where(d => d.Date >= from && d.Date <= to && d.ExcludedAt == null)
                .Select(d => d.Date)
                .ToListAsync(cancellationToken))
            .GroupBy(d => d)
            .ToDictionary(g => g.Key, g => g.Count());
        Dictionary<DateOnly, DailyQuizCompletion> completions = new();
        if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
        {
            string userId = userContext.UserId;
            completions = await db.DailyQuizCompletions.AsNoTracking()
                .Where(c => c.UserId == userId && c.Date >= from && c.Date <= to)
                .ToDictionaryAsync(c => c.Date, cancellationToken);
        }

        List<ArchiveEntryDto> days = dates
            .Where(d => totals.GetValueOrDefault(d) > 0)
            .OrderByDescending(d => d)
            .Select(d => new ArchiveEntryDto(
                FormatDate(d),
                totals[d],
                completions.TryGetValue(d, out DailyQuizCompletion? c) ? ToDto(c) : null))
            .ToList();
        return new ArchiveResponse(days);
    }

    private static (DateOnly From, DateOnly To) ArchiveWindow(DateOnly today)
    {
        DateOnly from = today.AddDays(-ArchiveDays);
        return (from < ArchiveStartDate ? ArchiveStartDate : from, today.AddDays(-1));
    }

    private static async Task<DailyQuizResponse> BuildResponseAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        DateOnly date,
        DateOnly today,
        List<DailyQuizItem> set,
        CancellationToken cancellationToken)
    {
        List<Guid> ids = set.Where(s => s.ExcludedAt is null).OrderBy(s => s.Position).Select(s => s.ItemId).ToList();

        Dictionary<Guid, Item> items = await db.Items.AsNoTracking()
            .Include(i => i.Category)
            .Include(i => i.ItemKeywords).ThenInclude(ik => ik.Keyword)
            .Where(i => ids.Contains(i.Id))
            .Where(ItemVisibility.PublicEligible)
            .ToDictionaryAsync(i => i.Id, cancellationToken);
        ItemResponseMapper mapper = new(userContext);
        List<GetItems.ItemResponse> responses = ids
            .Where(items.ContainsKey)
            .Select(id => mapper.MapToResponse(items[id], new List<GetItems.CollectionResponse>()))
            .ToList();

        CompletionDto? completion = null;
        int? streak = null;
        if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
        {
            List<DailyQuizCompletion> recent = await LoadRecentCompletionsAsync(db, userContext.UserId, today, cancellationToken);
            DailyQuizCompletion? match = recent.FirstOrDefault(c => c.Date == date);
            completion = match is null ? null : ToDto(match);
            streak = ComputeStreak(recent.Select(c => c.Date), today);
        }

        return new DailyQuizResponse(FormatDate(date), responses, completion, streak);
    }

    public static async Task<Result<CompleteResponse>> CompleteAsync(
        CompleteRequest request,
        ApplicationDbContext db,
        string userId,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        DateOnly today = DateOnly.FromDateTime(nowUtc);
        if (!TryParseDate(request.Date, out DateOnly date) || date > today || date < today.AddDays(-1))
        {
            return Result.Failure<CompleteResponse>(
                Error.Validation("DailyQuiz.InvalidDate", "Only today's or yesterday's daily quiz (UTC) can be completed."));
        }

        int activeItems = await db.DailyQuizItems.AsNoTracking()
            .CountAsync(d => d.Date == date && d.ExcludedAt == null, cancellationToken);
        if (activeItems == 0 || request.Total != activeItems)
        {
            return Result.Failure<CompleteResponse>(
                Error.Validation("DailyQuiz.TotalMismatch", "Total must equal the number of questions in that day's daily quiz."));
        }

        bool created = false;
        DailyQuizCompletion? existing = await db.DailyQuizCompletions.AsNoTracking()
            .FirstOrDefaultAsync(c => c.UserId == userId && c.Date == date, cancellationToken);
        if (existing is null)
        {
            DailyQuizCompletion entity = new()
            {
                UserId = userId,
                Date = date,
                Correct = request.Correct,
                Total = request.Total,
                Skipped = request.Skipped,
                CompletedAt = nowUtc,
            };
            db.DailyQuizCompletions.Add(entity);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                existing = entity;
                created = true;
            }
            catch (DbUpdateException)
            {
                // A concurrent submit for the same day won; the first stored result stands.
                db.ChangeTracker.Clear();
                existing = await db.DailyQuizCompletions.AsNoTracking()
                    .FirstAsync(c => c.UserId == userId && c.Date == date, cancellationToken);
            }
        }

        List<DailyQuizCompletion> recent = await LoadRecentCompletionsAsync(db, userId, today, cancellationToken);
        return Result.Success(new CompleteResponse(created, ComputeStreak(recent.Select(c => c.Date), today), ToDto(existing)));
    }

    public static async Task<Result<AdminDayResponse>> AdminGetAsync(
        string? date,
        ApplicationDbContext db,
        DateTime nowUtc,
        CancellationToken cancellationToken,
        ILogger? logger = null)
    {
        Result<DateOnly> parsed = ParseAdminDate(date, nowUtc);
        if (parsed.IsFailure) return Result.Failure<AdminDayResponse>(parsed.Error);

        List<DailyQuizItem> set = await EnsureSetAsync(db, parsed.Value, cancellationToken, logger);
        return Result.Success(await ToAdminResponseAsync(db, parsed.Value, set, cancellationToken));
    }

    public static async Task<Result<AdminDayResponse>> ExcludeAsync(
        string date,
        Guid itemId,
        ApplicationDbContext db,
        string adminUserId,
        DateTime nowUtc,
        CancellationToken cancellationToken,
        ILogger? logger = null)
    {
        Result<DateOnly> parsed = ParseAdminDate(date, nowUtc);
        if (parsed.IsFailure) return Result.Failure<AdminDayResponse>(parsed.Error);
        DateOnly day = parsed.Value;

        await EnsureSetAsync(db, day, cancellationToken, logger);
        DailyQuizItem? row = await db.DailyQuizItems.FirstOrDefaultAsync(d => d.Date == day && d.ItemId == itemId, cancellationToken);
        if (row is null || row.ExcludedAt is not null)
        {
            return Result.Failure<AdminDayResponse>(
                Error.NotFound("DailyQuiz.ItemNotInSet", "That item is not an active part of this day's daily quiz."));
        }

        row.ExcludedAt = nowUtc;
        row.ExcludedBy = adminUserId;

        List<DailyQuizItem> dayRows = await db.DailyQuizItems.Where(d => d.Date == day).ToListAsync(cancellationToken);
        HashSet<Guid> taken = dayRows.Select(d => d.ItemId).ToHashSet();
        Guid? replacement = await PickReplacementAsync(db, day, row, dayRows, taken, logger, cancellationToken);
        if (replacement is not null)
        {
            db.DailyQuizItems.Add(new DailyQuizItem
            {
                Date = day,
                ItemId = replacement.Value,
                Position = row.Position,
                CreatedAt = nowUtc,
            });
        }
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Another admin changed this day at the same moment (same item removed or same replacement chosen).
            db.ChangeTracker.Clear();
            return Result.Failure<AdminDayResponse>(
                Error.Conflict("DailyQuiz.ConcurrentChange", "This day's set was changed at the same time. Reload and try again."));
        }

        List<DailyQuizItem> updated = await db.DailyQuizItems.AsNoTracking().Where(d => d.Date == day).ToListAsync(cancellationToken);
        return Result.Success(await ToAdminResponseAsync(db, day, updated, cancellationToken));
    }

    /// <summary>
    /// Returns the stored set for the date, creating it from the date seed on first use. The header row and items are
    /// saved together, so concurrent creators conflict on the header and the loser reads the winner's set.
    /// </summary>
    internal static async Task<List<DailyQuizItem>> EnsureSetAsync(
        ApplicationDbContext db, DateOnly date, CancellationToken cancellationToken, ILogger? logger = null)
    {
        if (await db.DailyQuizSets.AsNoTracking().AnyAsync(s => s.Date == date, cancellationToken))
        {
            return await db.DailyQuizItems.AsNoTracking().Where(d => d.Date == date).ToListAsync(cancellationToken);
        }

        List<Guid> picked = await PickSetAsync(db, date, logger, cancellationToken);
        DateTime now = DateTime.UtcNow;
        List<DailyQuizItem> rows = picked
            .Select((id, index) => new DailyQuizItem { Date = date, ItemId = id, Position = index, CreatedAt = now })
            .ToList();
        // A day with nothing eligible still gets a header, so later reads do not recompute eligibility.
        db.DailyQuizSets.Add(new DailyQuizSet { Date = date, CreatedAt = now });
        db.DailyQuizItems.AddRange(rows);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return rows;
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            return await db.DailyQuizItems.AsNoTracking().Where(d => d.Date == date).ToListAsync(cancellationToken);
        }
    }

    /// <summary>
    /// Eligible items in seed order for the date: public, in a public category, with at least one playable wrong answer (#250: non-blank, not a duplicate, not equal to the correct answer), not flagged
    /// by the question quality report (#129), not in any other stored set within 30 days either side of the date (admins
    /// can create sets up to 7 days ahead), and not already taken for this date.
    /// </summary>
    internal static async Task<List<Guid>> RankCandidatesAsync(
        ApplicationDbContext db,
        DateOnly date,
        HashSet<Guid> taken,
        CancellationToken cancellationToken,
        HashSet<Guid>? flaggedIds = null)
    {
        // IncorrectAnswers is a value-converted JSON column, so the playable check runs after projection.
        var rows = await db.Items.AsNoTracking()
            .Where(ItemVisibility.PublicEligible)
            .Where(i => i.Category != null && !i.Category.IsPrivate)
            .Select(i => new { i.Id, i.CorrectAnswer, i.IncorrectAnswers })
            .ToListAsync(cancellationToken);

        DateOnly windowStart = date.AddDays(-RepeatWindowDays);
        DateOnly windowEnd = date.AddDays(RepeatWindowDays);
        HashSet<Guid> recent = (await db.DailyQuizItems.AsNoTracking()
                .Where(d => d.Date >= windowStart && d.Date <= windowEnd && d.Date != date)
                .Select(d => d.ItemId)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        HashSet<Guid> flagged = flaggedIds ?? await LoadQualityFlaggedAsync(db, cancellationToken);
        string seed = FormatDate(date);
        return rows
            .Where(r => QuizPlayability.IsPlayable(r.CorrectAnswer, r.IncorrectAnswers) && !recent.Contains(r.Id) && !flagged.Contains(r.Id) && !taken.Contains(r.Id))
            .Select(r => r.Id)
            .OrderBy(id => SeedRank(seed, id))
            .ThenBy(id => id)
            .ToList();
    }

    private static async Task<List<Guid>> PickSetAsync(ApplicationDbContext db, DateOnly date, ILogger? logger, CancellationToken cancellationToken)
    {
        List<DailyCandidateRow> rows = await LoadCandidateRowsAsync(db, cancellationToken);
        HashSet<Guid> flagged = await LoadQualityFlaggedAsync(db, cancellationToken);
        HashSet<Guid> window = await LoadWindowIdsAsync(db, date, cancellationToken);
        DailySelection selection = ComputeSelection(date, rows, window, flagged);
        LogSelection(logger, selection);
        if (selection.LegacyFallback)
        {
            return (await RankCandidatesAsync(db, date, new HashSet<Guid>(), cancellationToken, flagged)).Take(SetSize).ToList();
        }

        return selection.Picks.Select(p => p.ItemId).ToList();
    }

    /// <summary>
    /// Admin replacement for the excluded row: the top seed-ranked candidate of the slot its Position maps to, from the
    /// curated pool; the whole-catalog order only when fewer than five eligible items remain (or nothing fits at all).
    /// </summary>
    private static async Task<Guid?> PickReplacementAsync(
        ApplicationDbContext db,
        DateOnly day,
        DailyQuizItem excluded,
        List<DailyQuizItem> dayRows,
        HashSet<Guid> taken,
        ILogger? logger,
        CancellationToken cancellationToken)
    {
        List<DailyCandidateRow> rows = await LoadCandidateRowsAsync(db, cancellationToken);
        HashSet<Guid> flagged = await LoadQualityFlaggedAsync(db, cancellationToken);
        HashSet<Guid> window = await LoadWindowIdsAsync(db, day, cancellationToken);
        List<DailyCandidateRow> ranked = RankEligible(day, rows, window, flagged);
        DailySlot slot = (DailySlot)Math.Clamp(excluded.Position, 0, SetSize - 1);
        if (ranked.Count >= SetSize)
        {
            List<Guid> otherActive = dayRows.Where(d => d.ExcludedAt is null && d.ItemId != excluded.ItemId).Select(d => d.ItemId).ToList();
            List<string?> otherCategories = await db.Items.AsNoTracking()
                .Where(i => otherActive.Contains(i.Id))
                .Select(i => i.Category == null ? null : i.Category.Name)
                .ToListAsync(cancellationToken);
            HashSet<string> used = otherCategories.Where(c => c is not null).Select(c => c!.ToLowerInvariant()).ToHashSet();
            DailyCandidateRow? pick = PickForSlot(slot, ranked, taken, used, out string? reason);
            if (pick is not null)
            {
                if (reason is not null)
                {
                    LogFallback(logger, day, slot, reason);
                }

                return pick.Id;
            }
        }

        logger?.LogWarning(
            "Daily quiz {Date} slot {Slot} replacement: no eligible curated item, using whole-catalog seed order",
            FormatDate(day), slot);
        List<Guid> legacy = await RankCandidatesAsync(db, day, taken, cancellationToken, flagged);
        return legacy.Count > 0 ? legacy[0] : null;
    }

    /// <summary>
    /// Read-only dry run: computes the sets for <paramref name="days"/> consecutive dates from <paramref name="startDate"/> without
    /// writing anything. Each computed day's picks join the repeat window of the next days; stored sets outside the range are
    /// part of the window, stored sets inside the range are ignored (they are being recomputed).
    /// </summary>
    internal static async Task<List<DailySelection>> DryRunAsync(
        ApplicationDbContext db,
        DateOnly startDate,
        int days,
        CancellationToken cancellationToken,
        ILogger? logger = null)
    {
        List<DailyCandidateRow> rows = await LoadCandidateRowsAsync(db, cancellationToken);
        HashSet<Guid> flagged = await LoadQualityFlaggedAsync(db, cancellationToken);
        DateOnly endDate = startDate.AddDays(days - 1);
        DateOnly from = startDate.AddDays(-RepeatWindowDays);
        DateOnly to = endDate.AddDays(RepeatWindowDays);
        List<(DateOnly Date, Guid ItemId)> stored = (await db.DailyQuizItems.AsNoTracking()
                .Where(d => d.Date >= from && d.Date <= to && (d.Date < startDate || d.Date > endDate))
                .Select(d => new { d.Date, d.ItemId })
                .ToListAsync(cancellationToken))
            .Select(d => (d.Date, d.ItemId))
            .ToList();

        List<DailySelection> result = new();
        for (int offset = 0; offset < days; offset++)
        {
            DateOnly date = startDate.AddDays(offset);
            DateOnly windowStart = date.AddDays(-RepeatWindowDays);
            DateOnly windowEnd = date.AddDays(RepeatWindowDays);
            HashSet<Guid> window = stored
                .Where(d => d.Date >= windowStart && d.Date <= windowEnd && d.Date != date)
                .Select(d => d.ItemId)
                .ToHashSet();
            foreach (DailySelection earlier in result)
            {
                if (earlier.Date >= windowStart && earlier.Date <= windowEnd)
                {
                    window.UnionWith(earlier.Picks.Select(p => p.ItemId));
                }
            }

            DailySelection selection = ComputeSelection(date, rows, window, flagged);
            LogSelection(logger, selection);
            result.Add(selection);
        }

        return result;
    }

    /// <summary>
    /// Pure selection: no database access and nothing is saved. Rows are the SQL-prefiltered pool; windowIds are the items
    /// already planned within 30 days either side of the date; flaggedIds come from the quality report.
    /// </summary>
    internal static DailySelection ComputeSelection(
        DateOnly date,
        IReadOnlyList<DailyCandidateRow> rows,
        IReadOnlyCollection<Guid> windowIds,
        IReadOnlyCollection<Guid> flaggedIds)
    {
        List<DailyCandidateRow> ranked = RankEligible(date, rows, windowIds, flaggedIds);
        if (ranked.Count < SetSize)
        {
            return new DailySelection(date, Array.Empty<DailyPick>(), true);
        }

        HashSet<Guid> taken = new();
        HashSet<string> used = new();
        List<DailyPick> picks = new();
        for (int position = 0; position < SetSize; position++)
        {
            DailySlot slot = (DailySlot)position;
            DailyCandidateRow pick = PickForSlot(slot, ranked, taken, used, out string? reason)
                ?? throw new InvalidOperationException("A pool of at least five items always has an item left for a slot.");
            taken.Add(pick.Id);
            used.Add(pick.Category);
            picks.Add(new DailyPick(pick.Id, slot, reason));
        }

        return new DailySelection(date, picks, false);
    }

    internal static bool IsDailyEligible(DailyCandidateRow row)
    {
        if (Array.IndexOf(AllowedCategories, row.Category.ToLowerInvariant()) < 0) return false;
        if (string.IsNullOrWhiteSpace(row.Explanation)) return false;
        string question = (row.Question ?? string.Empty).Trim();
        string correct = (row.CorrectAnswer ?? string.Empty).Trim();
        if (question.Length == 0 || question.Length > MaxQuestionChars) return false;
        if (correct.Length == 0 || correct.Length > MaxAnswerChars) return false;
        if (row.IncorrectAnswers.Any(a => (a ?? string.Empty).Trim().Length > MaxAnswerChars)) return false;
        return QuizPlayability.GetDistractors(row.CorrectAnswer, row.IncorrectAnswers).Count >= MinDistractors;
    }

    /// <summary>Eligible rows (rules, window, quality flags) in seed order.</summary>
    private static List<DailyCandidateRow> RankEligible(
        DateOnly date,
        IReadOnlyList<DailyCandidateRow> rows,
        IReadOnlyCollection<Guid> windowIds,
        IReadOnlyCollection<Guid> flaggedIds)
    {
        HashSet<Guid> window = windowIds as HashSet<Guid> ?? windowIds.ToHashSet();
        HashSet<Guid> flagged = flaggedIds as HashSet<Guid> ?? flaggedIds.ToHashSet();
        string seed = FormatDate(date);
        return rows
            .Where(r => !window.Contains(r.Id) && !flagged.Contains(r.Id) && IsDailyEligible(r))
            .OrderBy(r => SeedRank(seed, r.Id))
            .ThenBy(r => r.Id)
            .ToList();
    }

    /// <summary>
    /// Top candidate of the slot, else the wildcard pool (a category the other active items do not use), else any eligible
    /// item; reason is null only when the slot's own pool supplied it. Null when nothing is left. Never leaves the eligible pool.
    /// </summary>
    private static DailyCandidateRow? PickForSlot(
        DailySlot slot,
        List<DailyCandidateRow> ranked,
        HashSet<Guid> taken,
        HashSet<string> usedCategories,
        out string? reason)
    {
        List<DailyCandidateRow> available = ranked.Where(r => !taken.Contains(r.Id)).ToList();
        IEnumerable<DailyCandidateRow> own = slot switch
        {
            DailySlot.Picture => available.Where(r => r.HasPicture),
            // Prefer a non-picture item so the set does not show a second flag; picture items only when nothing else fits.
            DailySlot.GeoHistory => available.Where(r => r.Category is "geography" or "history").OrderBy(r => r.HasPicture),
            DailySlot.SciNature => available.Where(r => r.Category is "science" or "nature"),
            DailySlot.Trivia => available.Where(r => r.Category == "trivia").OrderBy(r => r.IsBrainTeaser ? 0 : 1),
            _ => available.Where(r => !usedCategories.Contains(r.Category)),
        };
        DailyCandidateRow? pick = own.FirstOrDefault();
        if (pick is not null)
        {
            reason = null;
            return pick;
        }

        if (slot != DailySlot.Wildcard)
        {
            pick = available.FirstOrDefault(r => !usedCategories.Contains(r.Category));
            if (pick is not null)
            {
                reason = "slot pool empty; filled from the wildcard pool";
                return pick;
            }
        }

        pick = available.FirstOrDefault();
        reason = pick is null ? null : "slot pool and wildcard pool empty; filled from any eligible item";
        return pick;
    }

    private static async Task<List<DailyCandidateRow>> LoadCandidateRowsAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        // Category names are compared lower-cased so SQLite and Npgsql agree; the length and distractor rules run in memory on trimmed text.
        var rows = await db.Items.AsNoTracking()
            .Where(ItemVisibility.PublicEligible)
            .Where(i => i.Category != null && !i.Category.IsPrivate && AllowedCategories.Contains(i.Category.Name.ToLower()))
            .Select(i => new
            {
                i.Id,
                Category = i.Category!.Name,
                HasPicture = i.QuestionImageKey != null && i.QuestionImageKey != string.Empty,
                IsBrainTeaser = i.NavigationKeyword1 != null && i.NavigationKeyword1.Name.ToLower() == BrainTeasersKeyword,
                i.Question,
                i.CorrectAnswer,
                i.IncorrectAnswers,
                i.Explanation,
            })
            .ToListAsync(cancellationToken);
        return rows
            .Select(r => new DailyCandidateRow(
                r.Id, r.Category.ToLowerInvariant(), r.HasPicture, r.IsBrainTeaser, r.Question, r.CorrectAnswer, r.IncorrectAnswers, r.Explanation))
            .ToList();
    }

    private static async Task<HashSet<Guid>> LoadWindowIdsAsync(ApplicationDbContext db, DateOnly date, CancellationToken cancellationToken)
    {
        DateOnly windowStart = date.AddDays(-RepeatWindowDays);
        DateOnly windowEnd = date.AddDays(RepeatWindowDays);
        return (await db.DailyQuizItems.AsNoTracking()
                .Where(d => d.Date >= windowStart && d.Date <= windowEnd && d.Date != date)
                .Select(d => d.ItemId)
                .ToListAsync(cancellationToken))
            .ToHashSet();
    }

    private static void LogSelection(ILogger? logger, DailySelection selection)
    {
        if (logger is null) return;
        if (selection.LegacyFallback)
        {
            logger.LogWarning(
                "Daily quiz {Date}: fewer than {Needed} eligible items, using whole-catalog seed order",
                FormatDate(selection.Date), SetSize);
            return;
        }

        foreach (DailyPick pick in selection.Picks.Where(p => p.FallbackReason is not null))
        {
            LogFallback(logger, selection.Date, pick.Slot, pick.FallbackReason!);
        }
    }

    private static void LogFallback(ILogger? logger, DateOnly date, DailySlot slot, string reason) =>
        logger?.LogWarning("Daily quiz {Date} slot {Slot} fallback: {Reason}", FormatDate(date), slot, reason);

    private static async Task<HashSet<Guid>> LoadQualityFlaggedAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        Result<GetQuestionQualityReport.Response> report = await GetQuestionQualityReport.HandleAsync(
            new GetQuestionQualityReport.QueryRequest(), db, cancellationToken);
        return report.IsSuccess
            ? report.Value.Items.Where(i => i.CheckAnswerKey).Select(i => i.ItemId).ToHashSet()
            : new HashSet<Guid>();
    }

    /// <summary>Stable across processes and platforms: first 8 bytes of SHA-256("yyyy-MM-dd:" + item id).</summary>
    internal static ulong SeedRank(string seed, Guid itemId)
    {
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{seed}:{itemId:D}"));
        return BinaryPrimitives.ReadUInt64BigEndian(hash);
    }

    /// <summary>Consecutive days ending today, or ending yesterday when today is not completed yet.</summary>
    internal static int ComputeStreak(IEnumerable<DateOnly> completedDates, DateOnly today)
    {
        HashSet<DateOnly> days = completedDates.ToHashSet();
        DateOnly cursor = days.Contains(today) ? today : today.AddDays(-1);
        int streak = 0;
        while (days.Contains(cursor))
        {
            streak++;
            cursor = cursor.AddDays(-1);
        }
        return streak;
    }

    private static Task<List<DailyQuizCompletion>> LoadRecentCompletionsAsync(
        ApplicationDbContext db, string userId, DateOnly today, CancellationToken cancellationToken)
    {
        DateOnly since = today.AddDays(-MaxStreakLookbackDays);
        return db.DailyQuizCompletions.AsNoTracking()
            .Where(c => c.UserId == userId && c.Date >= since)
            .ToListAsync(cancellationToken);
    }

    private static async Task<AdminDayResponse> ToAdminResponseAsync(
        ApplicationDbContext db, DateOnly day, List<DailyQuizItem> set, CancellationToken cancellationToken)
    {
        List<Guid> ids = set.Select(s => s.ItemId).ToList();
        var items = await db.Items.AsNoTracking()
            .Where(i => ids.Contains(i.Id))
            .Select(i => new { i.Id, i.Question, Category = i.Category == null ? null : i.Category.Name, i.QuestionImageKey, i.QuestionImageAlt, i.QuestionImageAttribution, i.QuestionImageLongDescription, i.ImageRevision })
            .ToDictionaryAsync(i => i.Id, cancellationToken);
        List<AdminItemDto> rows = set
            .OrderBy(s => s.Position).ThenBy(s => s.ExcludedAt is null ? 1 : 0).ThenBy(s => s.ExcludedAt)
            .Select(s => new AdminItemDto(
                s.ItemId,
                s.Position,
                items.TryGetValue(s.ItemId, out var item) ? item.Question : "(item no longer exists)",
                items.TryGetValue(s.ItemId, out var meta) ? meta.Category : null,
                s.ExcludedAt is not null,
                s.ExcludedAt is null ? null : DateTime.SpecifyKind(s.ExcludedAt.Value, DateTimeKind.Utc),
                items.TryGetValue(s.ItemId, out var pic) ? ItemImageReferenceHelper.FromColumns(pic.QuestionImageKey, pic.QuestionImageAlt, pic.QuestionImageAttribution, pic.QuestionImageLongDescription, pic.ImageRevision) : null))
            .ToList();
        return new AdminDayResponse(FormatDate(day), rows);
    }

    private static Result<DateOnly> ParseAdminDate(string? date, DateTime nowUtc)
    {
        DateOnly today = DateOnly.FromDateTime(nowUtc);
        if (string.IsNullOrWhiteSpace(date)) return Result.Success(today);
        if (!TryParseDate(date, out DateOnly day) || day < today || day > today.AddDays(MaxAdminDaysAhead))
        {
            return Result.Failure<DateOnly>(
                Error.Validation("DailyQuiz.InvalidDate", $"Date must be yyyy-MM-dd between today and {MaxAdminDaysAhead} days ahead (UTC)."));
        }
        return Result.Success(day);
    }

    internal static bool TryParseDate(string? value, out DateOnly date) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    internal static string FormatDate(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static CompletionDto ToDto(DailyQuizCompletion c) =>
        new(c.Correct, c.Total, DateTime.SpecifyKind(c.CompletedAt, DateTimeKind.Utc), c.Skipped);

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<CompleteRequest>, CompleteValidator>();
        }
    }
}
