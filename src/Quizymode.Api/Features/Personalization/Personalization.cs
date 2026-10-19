using System.Text.RegularExpressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Personalization;

/// <summary>
/// PERSONAL-001 (#116): a signed-in user's explicit topic interests (public categories, by slug) and the public
/// cold-start list of popular categories that the SPA ranks the personalized home with.
/// </summary>
public static partial class Personalization
{
    public const int MaxInterests = 10;
    public const int PopularCategoryCount = 6;
    public const int PopularWindowDays = 30;
    internal const string PopularCacheKey = "home:popular-categories";
    private static readonly TimeSpan PopularCacheDuration = TimeSpan.FromHours(1);

    public sealed record InterestsResponse(List<string> Categories);

    public sealed record UpdateInterestsRequest(List<string> Categories);

    public sealed record PopularCategoriesResponse(List<string> Categories);

    public sealed class UpdateValidator : AbstractValidator<UpdateInterestsRequest>
    {
        public UpdateValidator()
        {
            RuleFor(x => x.Categories).NotNull();
            RuleFor(x => x.Categories).Must(c => c is null || c.Count <= MaxInterests)
                .WithMessage($"Choose at most {MaxInterests} topics");
            RuleFor(x => x.Categories).Must(c => c is null || c.Distinct(StringComparer.Ordinal).Count() == c.Count)
                .WithMessage("Topics must be unique");
            RuleForEach(x => x.Categories).NotEmpty().MaximumLength(64).Matches("^[a-z0-9_-]+$");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("users/me/interests", GetHandler)
                .WithTags("Users")
                .WithSummary("Get the current user's topic interests")
                .WithDescription("Category slugs in the order the user chose them; deleted or private categories are omitted. Requires authentication.")
                .RequireAuthorization()
                .Produces<InterestsResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized);

            app.MapPut("users/me/interests", PutHandler)
                .WithTags("Users")
                .WithSummary("Replace the current user's topic interests")
                .WithDescription("At most 10 unique slugs of public categories; the list order is kept. An empty list clears interests. Requires authentication.")
                .RequireAuthorization()
                .Produces<InterestsResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized);

            app.MapGet("home/popular-categories", PopularHandler)
                .WithTags("Home")
                .WithSummary("Popular categories for the personalized home cold start")
                .WithDescription("Up to 6 public category slugs ranked by completed quiz runs in the last 30 days (bots and internal traffic excluded). Slugs only, no counts. Cached for an hour.")
                .AllowAnonymous()
                .Produces<PopularCategoriesResponse>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> GetHandler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }
            return Results.Ok(await GetInterestsAsync(db, userContext.UserId, cancellationToken));
        }

        private static async Task<IResult> PutHandler(
            UpdateInterestsRequest request,
            IValidator<UpdateInterestsRequest> validator,
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

            Result<InterestsResponse> result = await ReplaceInterestsAsync(request, db, userContext.UserId, cancellationToken);
            return result.Match(Results.Ok, _ => CustomResults.Problem(result));
        }

        private static async Task<IResult> PopularHandler(
            ApplicationDbContext db,
            IMemoryCache cache,
            CancellationToken cancellationToken)
        {
            return Results.Ok(await GetPopularCategoriesAsync(db, cache, cancellationToken));
        }
    }

    public static async Task<InterestsResponse> GetInterestsAsync(ApplicationDbContext db, string userId, CancellationToken cancellationToken)
    {
        List<string> names = await (from interest in db.UserInterests.AsNoTracking()
                                    join category in db.Categories.AsNoTracking() on interest.CategoryId equals category.Id
                                    where interest.UserId == userId && !category.IsPrivate
                                    orderby interest.SortOrder
                                    select category.Name)
            .ToListAsync(cancellationToken);
        return new InterestsResponse(names.Select(ToSlug).Distinct(StringComparer.Ordinal).ToList());
    }

    public static async Task<Result<InterestsResponse>> ReplaceInterestsAsync(
        UpdateInterestsRequest request,
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        Dictionary<string, Guid> publicCategories = await LoadPublicCategorySlugsAsync(db, cancellationToken);
        List<string> unknown = request.Categories.Where(slug => !publicCategories.ContainsKey(slug)).ToList();
        if (unknown.Count > 0)
        {
            return Result.Failure<InterestsResponse>(
                Error.Validation("Interests.UnknownCategory", $"Unknown topic: {string.Join(", ", unknown)}"));
        }

        Dictionary<Guid, UserInterest> current = await db.UserInterests
            .Where(i => i.UserId == userId)
            .ToDictionaryAsync(i => i.CategoryId, cancellationToken);
        List<Guid> wanted = request.Categories.Select(slug => publicCategories[slug]).ToList();
        db.UserInterests.RemoveRange(current.Values.Where(i => !wanted.Contains(i.CategoryId)));
        for (int index = 0; index < wanted.Count; index++)
        {
            if (current.TryGetValue(wanted[index], out UserInterest? existing))
            {
                existing.SortOrder = index;
            }
            else
            {
                db.UserInterests.Add(new UserInterest { UserId = userId, CategoryId = wanted[index], SortOrder = index, CreatedAt = DateTime.UtcNow });
            }
        }
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success(new InterestsResponse(request.Categories.ToList()));
    }

    public static async Task<PopularCategoriesResponse> GetPopularCategoriesAsync(
        ApplicationDbContext db,
        IMemoryCache cache,
        CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(PopularCacheKey, out PopularCategoriesResponse? cached) && cached is not null)
        {
            return cached;
        }

        PopularCategoriesResponse response = await ComputePopularCategoriesAsync(db, cancellationToken);
        cache.Set(PopularCacheKey, response, PopularCacheDuration);
        return response;
    }

    /// <summary>
    /// Ranks category quiz scopes from the learning report (#128/ANALYTICS-007 aggregation) by completed runs, then runs
    /// started. Context ids come from clients, so only slugs of current public categories are returned.
    /// </summary>
    internal static async Task<PopularCategoriesResponse> ComputePopularCategoriesAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        Result<GetLearningReport.Response> report = await GetLearningReport.HandleAsync(
            new GetLearningReport.QueryRequest(Days: PopularWindowDays), db, cancellationToken);
        if (report.IsFailure) return new PopularCategoriesResponse(new List<string>());

        Dictionary<string, Guid> publicCategories = await LoadPublicCategorySlugsAsync(db, cancellationToken);
        List<string> ranked = report.Value.Scopes
            .Where(s => s.Mode == "quiz" && s.ContextType == "category" && !string.IsNullOrEmpty(s.ContextId))
            .GroupBy(s => ToSlug(s.ContextId!))
            .Where(g => publicCategories.ContainsKey(g.Key))
            .Select(g => new { Slug = g.Key, Completed = g.Sum(s => s.RunsCompleted ?? 0), Started = g.Sum(s => s.RunsStarted) })
            .OrderByDescending(x => x.Completed)
            .ThenByDescending(x => x.Started)
            .ThenBy(x => x.Slug, StringComparer.Ordinal)
            .Take(PopularCategoryCount)
            .Select(x => x.Slug)
            .ToList();
        return new PopularCategoriesResponse(ranked);
    }

    private static async Task<Dictionary<string, Guid>> LoadPublicCategorySlugsAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        var categories = await db.Categories.AsNoTracking()
            .Where(c => !c.IsPrivate)
            .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Select(c => new { c.Id, c.Name })
            .ToListAsync(cancellationToken);
        Dictionary<string, Guid> bySlug = new(StringComparer.Ordinal);
        foreach (var category in categories)
        {
            bySlug.TryAdd(ToSlug(category.Name), category.Id);
        }
        return bySlug;
    }

    /// <summary>Same rule as the SPA's <c>categoryNameToSlug</c> (utils/categorySlug.ts).</summary>
    internal static string ToSlug(string name)
    {
        string slug = name.ToLowerInvariant().Trim();
        slug = NonSlugCharacters().Replace(slug, string.Empty);
        slug = Whitespace().Replace(slug, "-");
        slug = RepeatedDashes().Replace(slug, "-");
        return slug.Trim('-');
    }

    [GeneratedRegex(@"[^\w\s-]", RegexOptions.ECMAScript)]
    private static partial Regex NonSlugCharacters();

    [GeneratedRegex(@"\s+", RegexOptions.ECMAScript)]
    private static partial Regex Whitespace();

    [GeneratedRegex("-+")]
    private static partial Regex RepeatedDashes();

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<UpdateInterestsRequest>, UpdateValidator>();
        }
    }
}
