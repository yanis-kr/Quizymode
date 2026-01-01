using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;

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
                .WithSummary("Get subcategories for a category")
                .WithDescription("Returns unique subcategories for a given category with item counts.")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string category,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(category))
            {
                return CustomResults.BadRequest("Category is required");
            }

            QueryRequest request = new(category);

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
            IQueryable<Quizymode.Api.Shared.Models.Item> query = db.Items.AsQueryable();

            // Apply visibility filter: anonymous users see only global items,
            // authenticated users see global + their private items
            if (!userContext.IsAuthenticated)
            {
                query = query.Where(i => !i.IsPrivate && i.Category != string.Empty);
            }
            else if (!string.IsNullOrEmpty(userContext.UserId))
            {
                // Include global items OR user's private items
                query = query.Where(i => 
                    i.Category != string.Empty && 
                    (!i.IsPrivate || (i.IsPrivate && i.CreatedBy == userContext.UserId)));
            }
            else
            {
                query = query.Where(i => !i.IsPrivate && i.Category != string.Empty);
            }

            // Filter by category (case-insensitive)
            string normalizedCategory = CategoryHelper.Normalize(request.Category);
            query = query.Where(i => EF.Functions.ILike(i.Category, normalizedCategory));

            // Get total count for the category
            int totalCount = await query.CountAsync(cancellationToken);

            // Perform grouping and counting in the database, then map to DTO in memory.
            // Fetch all items and group by normalized subcategory name in memory for case-insensitive grouping
            List<Quizymode.Api.Shared.Models.Item> allItems = await query.ToListAsync(cancellationToken);
            
            // Group by normalized subcategory name (case-insensitive)
            List<(string Subcategory, int Count)> grouped = allItems
                .GroupBy(i => CategoryHelper.Normalize(i.Subcategory), StringComparer.OrdinalIgnoreCase)
                .Select(g => (g.Key, g.Count()))
                .OrderBy(x => x.Subcategory)
                .ToList();

            List<SubcategoryResponse> subcategories = grouped
                .Select(x => new SubcategoryResponse(x.Subcategory, x.Count))
                .ToList();

            Response response = new(subcategories, totalCount);

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

