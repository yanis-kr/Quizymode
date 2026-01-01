using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Categories;

public static class GetCategories
{
    public sealed record QueryRequest(string? Search);

    public sealed record CategoryResponse(string Category, int Count);

    public sealed record Response(List<CategoryResponse> Categories);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("categories", Handler)
                .WithTags("Categories")
                .WithSummary("Get unique categories")
                .WithDescription("Returns unique category identifiers sorted alphabetically with optional search filter.")
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

            if (!string.IsNullOrWhiteSpace(request.Search))
            {
                string searchTerm = request.Search.Trim();
                query = query.Where(i => EF.Functions.ILike(i.Category, $"%{searchTerm}%"));
            }

            // Perform grouping and counting in the database, then map to DTO in memory.
            // Fetch all items and group by normalized category name in memory for case-insensitive grouping
            List<Item> allItems = await query.ToListAsync(cancellationToken);
            
            // Group by normalized category name (case-insensitive)
            List<CategoryResponse> categories = allItems
                .GroupBy(i => CategoryHelper.Normalize(i.Category), StringComparer.OrdinalIgnoreCase)
                .Select(g => new CategoryResponse(g.Key, g.Count()))
                .OrderBy(c => c.Category)
                .ToList();

            Response response = new(categories);

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


