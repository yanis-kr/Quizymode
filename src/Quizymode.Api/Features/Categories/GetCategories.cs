using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

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
                .WithDescription("Returns unique category identifiers (Depth=1) with item counts and average stars, sorted by highest average rating first, then by name.")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            string? search,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(search);

            Result<Response> result = await HandleAsync(request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            string currentUserId = userContext.UserId ?? "";

            // Query Categories table with counts and average ratings
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

            // Simplified query: calculate counts and average stars in one query
            List<CategoryResponse> categoryResponses = await categoriesQuery
                .Select(c => new
                {
                    CategoryName = c.Name,
                    CategoryId = c.Id,
                    IsPrivate = c.IsPrivate,
                    Count = c.CategoryItems.Count(ci => 
                        !ci.Item.IsPrivate || (ci.Item.IsPrivate && ci.Item.CreatedBy == currentUserId)),
                    AverageStars = db.CategoryItems
                        .Where(ci => ci.CategoryId == c.Id &&
                                     (!ci.Item.IsPrivate || (ci.Item.IsPrivate && ci.Item.CreatedBy == currentUserId)))
                        .Join(db.Ratings.Where(r => r.Stars.HasValue),
                            ci => ci.ItemId,
                            r => r.ItemId,
                            (ci, r) => (double?)r.Stars!.Value)
                        .DefaultIfEmpty()
                        .Average()
                })
                .OrderByDescending(x => x.AverageStars ?? -1)
                .ThenBy(x => x.CategoryName)
                .Select(x => new CategoryResponse(
                    x.CategoryName,
                    x.Count,
                    x.CategoryId,
                    x.IsPrivate,
                    x.AverageStars.HasValue ? Math.Round(x.AverageStars.Value, 2) : null))
                .ToListAsync(cancellationToken);

            Response response = new(categoryResponses);

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
