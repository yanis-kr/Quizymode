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

public static class GetSubcategories
{
    public sealed record QueryRequest(string Category);

    public sealed record SubcategoryResponse(string Subcategory, int Count);

    public sealed record Response(List<SubcategoryResponse> Subcategories, int TotalCount);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("categories/{category}/subcategories", Handler)
                .WithTags("Categories")
                .WithSummary("Get co-occurring subcategories for a category")
                .WithDescription("Returns co-occurring depth=2 labels for items that have the specified depth=1 category label. Results are cached.")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string category,
            ApplicationDbContext db,
            IUserContext userContext,
            IMemoryCache cache,
            IOptions<CategoryOptions> categoryOptions,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(category))
            {
                return CustomResults.BadRequest("Category is required");
            }

            QueryRequest request = new(category);

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
            string categoryName = request.Category.Trim();

            // Build cache key including user context and category name
            string userId = userContext.UserId ?? "anonymous";
            string cacheKey = $"subcategories:depth2:{userId}:{categoryName}";
            int cacheTtlMinutes = categoryOptions.Value.SubcategoriesCacheTtlMinutes;

            // Try cache first
            if (cache.TryGetValue(cacheKey, out Response? cachedResponse) && cachedResponse is not null)
            {
                return Result.Success(cachedResponse);
            }

            // Find the category (depth=1) - case-insensitive, visible to user
            Category? category = null;
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                category = await db.Categories
                    .FirstOrDefaultAsync(
                        c => c.Depth == 1 &&
                             !c.IsPrivate &&
                             EF.Functions.ILike(c.Name, categoryName),
                        cancellationToken);
            }
            else
            {
                category = await db.Categories
                    .FirstOrDefaultAsync(
                        c => c.Depth == 1 &&
                             (EF.Functions.ILike(c.Name, categoryName)) &&
                             (!c.IsPrivate || (c.IsPrivate && c.CreatedBy == userContext.UserId)),
                        cancellationToken);
            }

            if (category is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Category.NotFound", $"Category '{categoryName}' not found"));
            }

            // Get items that have this category (depth=1) and are visible to user
            IQueryable<Item> itemsWithCategory = db.Items
                .Where(i => i.CategoryItems.Any(ci => ci.CategoryId == category.Id));

            // Apply visibility filter
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                itemsWithCategory = itemsWithCategory.Where(i => !i.IsPrivate);
            }
            else
            {
                itemsWithCategory = itemsWithCategory.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == userContext.UserId));
            }

            // Get distinct item IDs
            List<Guid> itemIds = await itemsWithCategory.Select(i => i.Id).Distinct().ToListAsync(cancellationToken);
            int totalCount = itemIds.Count;

            // Get co-occurring subcategories (depth=2) for these items
            // Group by subcategory and compute counts
            List<SubcategoryResponse> subcategories = await db.CategoryItems
                .Where(ci => 
                    itemIds.Contains(ci.ItemId) &&
                    ci.Category.Depth == 2)
                .GroupBy(ci => ci.Category)
                .Select(g => new SubcategoryResponse(
                    g.Key.Name,
                    g.Select(ci => ci.ItemId).Distinct().Count()))
                .OrderByDescending(s => s.Count)
                .ThenBy(s => s.Subcategory)
                .ToListAsync(cancellationToken);

            Response response = new(subcategories, totalCount);

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
                Error.Problem("Subcategories.GetFailed", $"Failed to get subcategories: {ex.Message}"));
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
