using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;

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
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(search);

            Result<Response> result = await HandleAsync(request, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<Quizymode.Api.Shared.Models.Item> query = db.Items
                .Where(i => !i.IsPrivate && i.Category != string.Empty);

            if (!string.IsNullOrWhiteSpace(request.Search))
            {
                string searchTerm = request.Search.Trim();
                query = query.Where(i => EF.Functions.ILike(i.Category, $"%{searchTerm}%"));
            }

            // Perform grouping and counting in the database, then map to DTO in memory.
            List<(string Category, int Count)> grouped = await query
                .GroupBy(i => i.Category)
                .Select(g => new { Category = g.Key, Count = g.Count() })
                .OrderBy(x => x.Category)
                .ToListAsync(cancellationToken)
                .ContinueWith(t => t.Result
                    .Select(x => (x.Category, x.Count))
                    .ToList(), cancellationToken);

            List<CategoryResponse> categories = grouped
                .Select(x => new CategoryResponse(x.Category, x.Count))
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


