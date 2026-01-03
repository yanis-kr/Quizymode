using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.Categories;

public static class GetCategories
{
    public sealed record QueryRequest(string? Search);

    public sealed record CategoryResponse(string Category, int Count, Guid Id, bool IsPrivate, double? AverageStars);

    public sealed record Response(List<CategoryResponse> Categories);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("categories", Handler)
                .WithTags("Categories")
                .WithSummary("Get unique categories")
                .WithDescription("Returns unique categories with item counts and average stars, sorted by highest average rating first, then by name. Results are cached.")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            string? search,
            ApplicationDbContext db,
            IUserContext userContext,
            IMemoryCache cache,
            IOptions<CategoryOptions> categoryOptions,
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(search);

            Result<Response> result = await HandleAsync(request, db, userContext, cache, categoryOptions, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        IMemoryCache cache,
        IOptions<CategoryOptions> categoryOptions,
        CancellationToken cancellationToken)
    {
        try
        {
            // Build cache key including user context for visibility
            // Version 2 includes averageStars in response
            string userId = userContext.UserId ?? "anonymous";
            string cacheKey = $"categories:v2:{userId}:{request.Search ?? "all"}";
            int cacheTtlMinutes = categoryOptions.Value.CategoriesCacheTtlMinutes;

            // Try cache first
            if (cache.TryGetValue(cacheKey, out Response? cachedResponse) && cachedResponse is not null)
            {
                return Result.Success(cachedResponse);
            }

            // Query Categories table
            IQueryable<Category> categoriesQuery = db.Categories.AsQueryable();

            // Apply visibility filter: show global + user's private categories
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                categoriesQuery = categoriesQuery.Where(c => !c.IsPrivate);
            }
            else
            {
                categoriesQuery = categoriesQuery.Where(c => !c.IsPrivate || (c.IsPrivate && c.CreatedBy == userContext.UserId));
            }

            // Apply search filter if provided
            if (!string.IsNullOrWhiteSpace(request.Search))
            {
                string searchTerm = request.Search.Trim().ToLower();
                categoriesQuery = categoriesQuery.Where(c => c.Name.ToLower().Contains(searchTerm));
            }

            // Get categories with item counts and average stars via join
            // Calculate average stars using a more EF Core-friendly approach
            string currentUserId = userContext.UserId ?? "";
            
            // First get categories with counts (no sorting yet - we'll sort after calculating averages)
            List<(Guid CategoryId, string CategoryName, int Count, bool IsPrivate)> categoriesData = await categoriesQuery
                .Select(c => new
                {
                    c.Id,
                    c.Name,
                    Count = c.Items.Count(i => 
                        // Only count items visible to user
                        (!i.IsPrivate || (i.IsPrivate && i.CreatedBy == currentUserId))),
                    c.IsPrivate
                })
                .Select(x => new ValueTuple<Guid, string, int, bool>(x.Id, x.Name, x.Count, x.IsPrivate))
                .ToListAsync(cancellationToken);

            // Get all visible item IDs grouped by category
            List<Guid> categoryIds = categoriesData.Select(c => c.CategoryId).ToList();
            Dictionary<Guid, List<Guid>> categoryItemIds = await db.Items
                .Where(i => i.CategoryId.HasValue && 
                             categoryIds.Contains(i.CategoryId.Value) &&
                             (!i.IsPrivate || (i.IsPrivate && i.CreatedBy == currentUserId)))
                .GroupBy(i => i.CategoryId!.Value)
                .Select(g => new { CategoryId = g.Key, ItemIds = g.Select(i => i.Id).ToList() })
                .ToDictionaryAsync(x => x.CategoryId, x => x.ItemIds, cancellationToken);

            // Get all ratings grouped by category
            List<Guid> allItemIds = categoryItemIds.Values.SelectMany(x => x).Distinct().ToList();
            Dictionary<Guid, List<int>> categoryRatings = new();
            
            if (allItemIds.Count > 0)
            {
                // Get all ratings for items in these categories, grouped by category
                List<(Guid CategoryId, int Stars)> ratingsByCategory = await db.Items
                    .Where(i => allItemIds.Contains(i.Id) && i.CategoryId.HasValue)
                    .Join(db.Ratings.Where(r => r.Stars.HasValue),
                        i => i.Id,
                        r => r.ItemId,
                        (i, r) => new ValueTuple<Guid, int>(i.CategoryId!.Value, r.Stars!.Value))
                    .ToListAsync(cancellationToken);
                
                categoryRatings = ratingsByCategory
                    .GroupBy(x => x.CategoryId)
                    .ToDictionary(g => g.Key, g => g.Select(x => x.Stars).ToList());
            }

            // Calculate category averages
            List<CategoryResponse> categoryResponses = categoriesData.Select(cat => 
            {
                double? averageStars = null;
                
                if (categoryRatings.TryGetValue(cat.CategoryId, out List<int>? ratings) && ratings.Count > 0)
                {
                    averageStars = Math.Round(ratings.Average(), 2);
                }
                
                return new CategoryResponse(
                    cat.CategoryName,
                    cat.Count,
                    cat.CategoryId,
                    cat.IsPrivate,
                    averageStars);
            })
            // Sort by highest average rating first, then by name
            // Categories with null ratings go last
            .OrderByDescending(c => c.AverageStars ?? -1)
            .ThenBy(c => c.Category)
            .ToList();

            Response response = new(categoryResponses);

            // Cache the result
            MemoryCacheEntryOptions cacheOptions = new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(cacheTtlMinutes)
            };
            cache.Set(cacheKey, response, cacheOptions);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Categories.GetFailed", $"Failed to get categories: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature.
        }
    }
}
