using Quizymode.Api.Features;
using Quizymode.Api.Data;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Models;
using Microsoft.EntityFrameworkCore;
using Quizymode.Taxonomy;

namespace Quizymode.Api.Features.Taxonomy;

public static class GetTaxonomy
{
    public sealed record L2Dto(string Slug, string? Description, int ItemCount);

    public sealed record L1Dto(string Slug, string? Description, int ItemCount, IReadOnlyList<L2Dto> Keywords);

    public sealed record CategoryDto(
        string Slug,
        string Name,
        string? Description,
        int ItemCount,
        IReadOnlyList<L1Dto> Groups,
        IReadOnlyList<string> AllKeywordSlugs);

    public sealed record Response(IReadOnlyList<CategoryDto> Categories);

    private sealed record VisibleCategoryRow(
        Guid Id,
        string Name,
        string? Description,
        string? ShortDescription,
        bool IsPrivate);

    private sealed record CategoryCountRow(Guid CategoryId, int ItemCount);

    private sealed record NavigationKeywordCountRow(Guid CategoryId, string KeywordSlug, int ItemCount);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("taxonomy", Handler)
                .WithTags("Taxonomy")
                .WithSummary("Get category and keyword taxonomy (from YAML, in-memory)")
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            ITaxonomyRegistry registry,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Response response = await BuildResponseAsync(registry, db, userContext, cancellationToken);
            return Results.Ok(response);
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
        }
    }

    private static async Task<Response> BuildResponseAsync(
        ITaxonomyRegistry registry,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string? currentUserId = userContext.UserId;
        bool isAuthenticated = userContext.IsAuthenticated && !string.IsNullOrEmpty(currentUserId);

        IQueryable<Category> visibleCategoryEntities = db.Categories.AsNoTracking();

        if (!isAuthenticated || string.IsNullOrEmpty(currentUserId))
        {
            visibleCategoryEntities = visibleCategoryEntities.Where(category => !category.IsPrivate);
        }
        else
        {
            string safeCurrentUserId = currentUserId;
            visibleCategoryEntities = visibleCategoryEntities
                .Where(category => !category.IsPrivate || category.CreatedBy == safeCurrentUserId);
        }

        IQueryable<VisibleCategoryRow> visibleCategoriesQuery = visibleCategoryEntities
            .Select(category => new VisibleCategoryRow(
                category.Id,
                category.Name,
                category.Description,
                category.ShortDescription,
                category.IsPrivate));

        List<VisibleCategoryRow> visibleCategories = await visibleCategoriesQuery.ToListAsync(cancellationToken);
        List<Guid> visibleCategoryIds = visibleCategories.Select(category => category.Id).ToList();

        Dictionary<string, VisibleCategoryRow> categoriesBySlug = visibleCategories
            .OrderBy(category => category.IsPrivate ? 1 : 0)
            .GroupBy(category => CategoryHelper.NameToSlug(category.Name), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        Dictionary<Guid, int> itemCountsByCategoryId = await BuildCategoryCountsAsync(
            db,
            visibleCategoryIds,
            userContext,
            cancellationToken);

        Dictionary<string, int> itemCountsByNavigationKey = await BuildNavigationKeywordCountsAsync(
            db,
            visibleCategoryIds,
            userContext,
            cancellationToken);

        List<CategoryDto> categories = [];
        foreach (string slug in registry.CategorySlugs)
        {
            TaxonomyCategoryDefinition? definition = registry.GetCategory(slug);
            if (definition is null)
            {
                continue;
            }

            categoriesBySlug.TryGetValue(definition.Slug, out VisibleCategoryRow? visibleCategory);
            int categoryItemCount = visibleCategory is not null &&
                                    itemCountsByCategoryId.TryGetValue(visibleCategory.Id, out int count)
                ? count
                : 0;

            List<L1Dto> groups = definition.L1Groups
                .Select(group => new L1Dto(
                    group.Slug,
                    group.Description,
                    visibleCategory is null
                        ? 0
                        : GetNavigationKeywordCount(itemCountsByNavigationKey, visibleCategory.Id, group.Slug),
                    group.L2Leaves
                        .Select(leaf => new L2Dto(
                            leaf.Slug,
                            leaf.Description,
                            visibleCategory is null
                                ? 0
                                : GetNavigationKeywordCount(itemCountsByNavigationKey, visibleCategory.Id, leaf.Slug)))
                        .ToList()))
                .ToList();

            categories.Add(new CategoryDto(
                definition.Slug,
                visibleCategory?.Name ?? FormatFallbackLabel(definition.Slug),
                visibleCategory?.Description ?? visibleCategory?.ShortDescription ?? definition.Description,
                categoryItemCount,
                groups,
                definition.AllKeywordSlugs.OrderBy(value => value, StringComparer.Ordinal).ToList()));
        }

        return new Response(categories);
    }

    private static async Task<Dictionary<Guid, int>> BuildCategoryCountsAsync(
        ApplicationDbContext db,
        IReadOnlyCollection<Guid> categoryIds,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (categoryIds.Count == 0)
        {
            return new Dictionary<Guid, int>();
        }

        IQueryable<Item> query = db.Items
            .AsNoTracking()
            .Where(item => item.CategoryId.HasValue && categoryIds.Contains(item.CategoryId.Value));

        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
        {
            query = query.Where(item => !item.IsPrivate);
        }
        else
        {
            string currentUserId = userContext.UserId;
            query = query.Where(item => !item.IsPrivate || item.CreatedBy == currentUserId);
        }

        return await query
            .GroupBy(item => item.CategoryId!.Value)
            .Select(group => new CategoryCountRow(group.Key, group.Count()))
            .ToDictionaryAsync(row => row.CategoryId, row => row.ItemCount, cancellationToken);
    }

    private static async Task<Dictionary<string, int>> BuildNavigationKeywordCountsAsync(
        ApplicationDbContext db,
        IReadOnlyCollection<Guid> categoryIds,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (categoryIds.Count == 0)
        {
            return new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        }

        IQueryable<Item> visibleItems = db.Items
            .AsNoTracking()
            .Where(item => item.CategoryId.HasValue && categoryIds.Contains(item.CategoryId.Value));

        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
        {
            visibleItems = visibleItems.Where(item => !item.IsPrivate);
        }
        else
        {
            string currentUserId = userContext.UserId;
            visibleItems = visibleItems.Where(item => !item.IsPrivate || item.CreatedBy == currentUserId);
        }

        List<NavigationKeywordCountRow> nav1Counts = await visibleItems
            .Where(item => item.NavigationKeywordId1.HasValue && item.NavigationKeyword1 != null)
            .GroupBy(item => new
            {
                CategoryId = item.CategoryId!.Value,
                KeywordSlug = item.NavigationKeyword1!.Name.ToLower()
            })
            .Select(group => new NavigationKeywordCountRow(
                group.Key.CategoryId,
                group.Key.KeywordSlug,
                group.Count()))
            .ToListAsync(cancellationToken);

        List<NavigationKeywordCountRow> nav2Counts = await visibleItems
            .Where(item => item.NavigationKeywordId2.HasValue && item.NavigationKeyword2 != null)
            .GroupBy(item => new
            {
                CategoryId = item.CategoryId!.Value,
                KeywordSlug = item.NavigationKeyword2!.Name.ToLower()
            })
            .Select(group => new NavigationKeywordCountRow(
                group.Key.CategoryId,
                group.Key.KeywordSlug,
                group.Count()))
            .ToListAsync(cancellationToken);

        Dictionary<string, int> counts = new(StringComparer.OrdinalIgnoreCase);
        foreach (NavigationKeywordCountRow row in nav1Counts.Concat(nav2Counts))
        {
            string key = BuildNavigationCountKey(row.CategoryId, row.KeywordSlug);
            counts[key] = counts.TryGetValue(key, out int existingCount)
                ? existingCount + row.ItemCount
                : row.ItemCount;
        }

        return counts;
    }

    private static int GetNavigationKeywordCount(
        IReadOnlyDictionary<string, int> counts,
        Guid categoryId,
        string keywordSlug)
    {
        return counts.TryGetValue(BuildNavigationCountKey(categoryId, keywordSlug), out int count)
            ? count
            : 0;
    }

    private static string BuildNavigationCountKey(Guid categoryId, string keywordSlug)
    {
        return $"{categoryId:N}|{keywordSlug}".ToLowerInvariant();
    }

    private static string FormatFallbackLabel(string slug)
    {
        string[] segments = slug
            .Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        List<string> words = [];
        foreach (string segment in segments)
        {
            if (segment.All(char.IsUpper))
            {
                words.Add(segment);
                continue;
            }

            if (segment.Length > 1 &&
                segment.TakeWhile(char.IsLetter).Count() >= 2 &&
                segment.Any(char.IsDigit))
            {
                words.Add(segment.ToUpperInvariant());
                continue;
            }

            words.Add(char.ToUpperInvariant(segment[0]) + segment[1..]);
        }

        return words.Count > 0 ? string.Join(" ", words) : slug;
    }
}
