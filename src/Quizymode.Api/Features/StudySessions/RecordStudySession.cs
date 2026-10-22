using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudySessions;

/// <summary>
/// PROGRESS-001 (#114): saves one completed quiz run to the signed-in user's private history.
/// Idempotent by (user, runId): a retry returns the stored session with <c>Created = false</c>.
/// </summary>
public static class RecordStudySession
{
    public const int MaxTotal = 1000;
    public const int MaxMissedItems = 200;
    public const int MaxRunIdLength = 128;
    public const int MaxKeywordsPerList = 10;
    public const int MaxKeywordLength = 30;
    public const int RetentionDays = 365;

    public sealed record SourceDto(
        string Kind,
        Guid? CollectionId,
        string? CategorySlug,
        List<string>? NavigationKeywords,
        List<string>? FilterKeywords);

    public sealed record Request(
        string RunId,
        DateTime CompletedAt,
        int Correct,
        int Total,
        SourceDto? Source,
        List<Guid>? MissedItemIds,
        string? Mode = null);

    public sealed record SessionDto(
        Guid Id,
        string RunId,
        string Origin,
        DateTime CompletedAt,
        int Correct,
        int Total,
        SourceDto? Source,
        List<Guid> MissedItemIds,
        string Mode);

    public sealed record Response(SessionDto Session, bool Created);

    public sealed class SourceValidator : AbstractValidator<SourceDto>
    {
        public SourceValidator()
        {
            RuleFor(x => x.Kind).Must(k => k is "collection" or "category" or "global")
                .WithMessage("Source kind must be collection, category, or global");
            RuleFor(x => x.CollectionId).NotEmpty().When(x => x.Kind == "collection");
            RuleFor(x => x.CategorySlug).NotEmpty().MaximumLength(64).Matches("^[a-z0-9_-]+$")
                .When(x => x.Kind == "category");
            RuleFor(x => x.NavigationKeywords).Must(KeywordsValid)
                .WithMessage("Keywords must be at most 10 canonical slugs of 30 characters or fewer");
            RuleFor(x => x.FilterKeywords).Must(KeywordsValid)
                .WithMessage("Keywords must be at most 10 canonical slugs of 30 characters or fewer");
        }

        private static bool KeywordsValid(List<string>? keywords) =>
            keywords is null ||
            (keywords.Count <= MaxKeywordsPerList &&
             keywords.All(k => k.Length is > 0 and <= MaxKeywordLength && k.All(c => char.IsAsciiLetterOrDigit(c) || c == '-')));
    }

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.RunId).NotEmpty().MaximumLength(MaxRunIdLength).Matches("^[A-Za-z0-9-]+$");
            RuleFor(x => x.CompletedAt).Must(IsPlausibleTimestamp)
                .WithMessage("CompletedAt must not be in the future or older than the retention window");
            RuleFor(x => x.Mode).Must(m => m is null or StudySessionModes.Quiz or StudySessionModes.Learn)
                .WithMessage("Mode must be quiz or learn");
            RuleFor(x => x.Total).InclusiveBetween(1, MaxTotal);
            RuleFor(x => x.Correct).GreaterThanOrEqualTo(0).LessThanOrEqualTo(x => x.Total);
            RuleFor(x => x.Source!).SetValidator(new SourceValidator()).When(x => x.Source is not null);
            RuleFor(x => x.MissedItemIds).Must((request, ids) => MissedValid(request, ids))
                .WithMessage("MissedItemIds must be unique, at most 200, and no more than Total - Correct");
        }

        internal static bool IsPlausibleTimestamp(DateTime value) =>
            value <= DateTime.UtcNow.AddMinutes(5) && value >= DateTime.UtcNow.AddDays(-RetentionDays);

        private static bool MissedValid(Request request, List<Guid>? ids)
        {
            if (ids is null || ids.Count == 0) return true;
            return ids.Count <= MaxMissedItems &&
                   ids.Count <= Math.Max(0, request.Total - request.Correct) &&
                   ids.Distinct().Count() == ids.Count &&
                   ids.All(id => id != Guid.Empty);
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-sessions", Handler)
                .WithTags("StudySessions")
                .WithSummary("Save a completed quiz run to the current user's history")
                .WithDescription("Idempotent by run ID: a retry returns the stored session with created=false. Requires authentication.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
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
                string errors = string.Join("; ", validation.Errors.Select(e => e.ErrorMessage));
                return CustomResults.BadRequest(errors, "Validation failed");
            }

            Result<Response> result = await HandleAsync(request, StudySessionOrigins.Quiz, db, userContext.UserId, cancellationToken);
            return result.Match(
                value => value.Created ? Results.Created($"/api/study-sessions/{value.Session.Id}", value) : Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        string origin,
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        try
        {
            StudySession? existing = await FindAsync(db, userId, request.RunId, cancellationToken);
            if (existing is not null)
            {
                return Result.Success(new Response(ToDto(existing), false));
            }

            StudySession entity = new()
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                RunId = request.RunId,
                Origin = origin,
                Mode = request.Mode ?? StudySessionModes.Quiz,
                CompletedAt = DateTime.SpecifyKind(request.CompletedAt, DateTimeKind.Utc),
                CreatedAt = DateTime.UtcNow,
                Correct = request.Correct,
                Total = request.Total,
                SourceKind = request.Source?.Kind,
                SourceCollectionId = request.Source?.Kind == "collection" ? request.Source.CollectionId : null,
                SourceCategorySlug = request.Source?.Kind == "category" ? request.Source.CategorySlug : null,
                NavigationKeywords = string.Join(',', Distinct(request.Source?.NavigationKeywords)),
                FilterKeywords = string.Join(',', Distinct(request.Source?.FilterKeywords)),
            };
            foreach (Guid itemId in (request.MissedItemIds ?? new List<Guid>()).Distinct())
            {
                entity.MissedItems.Add(new StudySessionMissedItem { StudySessionId = entity.Id, ItemId = itemId });
            }

            db.StudySessions.Add(entity);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // A concurrent retry of the same run won the unique index; return its row.
                db.ChangeTracker.Clear();
                StudySession? winner = await FindAsync(db, userId, request.RunId, cancellationToken);
                if (winner is null) throw;
                return Result.Success(new Response(ToDto(winner), false));
            }

            if (origin == StudySessionOrigins.Quiz && entity.MissedItems.Count > 0)
            {
                // REVIEW-001 (#117): live misses join the review queue after the history row is safely stored;
                // unverified guest imports do not.
                try
                {
                    await ReviewQueue.ReviewQueue.EnqueueMissesAsync(
                        db, userId, entity.MissedItems.Select(m => m.ItemId).ToList(), DateTime.UtcNow, cancellationToken);
                }
                catch (DbUpdateException)
                {
                    // The session is already stored; reporting failure would make the client retry into the idempotent
                    // replay path, which never enqueues. Losing these misses after a repeated conflict is the lesser harm.
                    db.ChangeTracker.Clear();
                }
            }

            await PruneExpiredAsync(db, userId, cancellationToken);
            return Result.Success(new Response(ToDto(entity), true));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("StudySessions.RecordFailed", "Failed to save study session.", ex));
        }
    }

    internal static async Task PruneExpiredAsync(ApplicationDbContext db, string userId, CancellationToken cancellationToken)
    {
        DateTime cutoff = DateTime.UtcNow.AddDays(-RetentionDays);
        List<StudySession> expired = await db.StudySessions
            .Where(s => s.UserId == userId && s.CompletedAt < cutoff)
            .Include(s => s.MissedItems)
            .ToListAsync(cancellationToken);
        if (expired.Count == 0) return;
        db.StudySessions.RemoveRange(expired);
        await db.SaveChangesAsync(cancellationToken);
    }

    private static Task<StudySession?> FindAsync(ApplicationDbContext db, string userId, string runId, CancellationToken ct) =>
        db.StudySessions.Include(s => s.MissedItems).AsNoTracking()
            .FirstOrDefaultAsync(s => s.UserId == userId && s.RunId == runId, ct);

    private static IEnumerable<string> Distinct(List<string>? values) =>
        (values ?? new List<string>()).Distinct(StringComparer.Ordinal);

    internal static SessionDto ToDto(StudySession s)
    {
        SourceDto? source = s.SourceKind is null
            ? null
            : new SourceDto(
                s.SourceKind,
                s.SourceCollectionId,
                s.SourceCategorySlug,
                Split(s.NavigationKeywords),
                Split(s.FilterKeywords));
        return new SessionDto(
            s.Id,
            s.RunId,
            s.Origin,
            DateTime.SpecifyKind(s.CompletedAt, DateTimeKind.Utc),
            s.Correct,
            s.Total,
            source,
            s.MissedItems.Select(m => m.ItemId).OrderBy(id => id).ToList(),
            s.Mode);
    }

    private static List<string> Split(string value) =>
        value.Length == 0 ? new List<string>() : value.Split(',').ToList();

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
