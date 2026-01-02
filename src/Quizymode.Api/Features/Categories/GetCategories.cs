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

    public sealed record CategoryResponse(string Category, int Count, Guid Id, bool IsPrivate);

    public sealed record Response(List<CategoryResponse> Categories);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("categories", Handler)
                .WithTags("Categories")
                .WithSummary("Get unique categories")
                .WithDescription("Returns unique category identifiers (Depth=1) with item counts, sorted by count descending. Results are cached.")
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
            string userId = userContext.UserId ?? "anonymous";
            string cacheKey = $"categories:depth1:{userId}:{request.Search ?? "all"}";
            int cacheTtlMinutes = categoryOptions.Value.CategoriesCacheTtlMinutes;

            // Try cache first
            if (cache.TryGetValue(cacheKey, out Response? cachedResponse) && cachedResponse is not null)
            {
                return Result.Success(cachedResponse);
            }

            // Query Categories table joined with CategoryItems to compute counts
            IQueryable<Category> categoriesQuery = db.Categories
                .Where(c => c.Depth == 1);

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

            // Get categories with item counts via join
            // Order by count expression before projecting to CategoryResponse
            string currentUserId = userContext.UserId ?? "";
            List<CategoryResponse> categoryResponses = await categoriesQuery
                .Select(c => new
                {
                    Category = c,
                    Count = c.CategoryItems.Count(ci => 
                        // Only count items visible to user
                        (!ci.Item.IsPrivate || (ci.Item.IsPrivate && ci.Item.CreatedBy == currentUserId)))
                })
                .OrderByDescending(x => x.Count)
                .ThenBy(x => x.Category.Name)
                .Select(x => new CategoryResponse(
                    x.Category.Name,
                    x.Count,
                    x.Category.Id,
                    x.Category.IsPrivate))
                .ToListAsync(cancellationToken);

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
