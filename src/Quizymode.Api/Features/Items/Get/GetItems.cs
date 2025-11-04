using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Get;

public static class GetItems
{
    public sealed record QueryRequest(
        string? CategoryId,
        string? SubcategoryId,
        int Page = 1,
        int PageSize = 10);

    public sealed record Response(
        List<ItemResponse> Items,
        int TotalCount,
        int Page,
        int PageSize,
        int TotalPages);

    public sealed record ItemResponse(
        string Id,
        string CategoryId,
        string SubcategoryId,
        string Visibility,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("items", Handler)
                .WithTags("Items")
                .WithSummary("Get quiz items with filtering and pagination")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string? categoryId,
            string? subcategoryId,
            int page = 1,
            int pageSize = 10,
            ApplicationDbContext db = null!,
            CancellationToken cancellationToken = default)
        {
            if (page < 1)
            {
                return Results.BadRequest("Page must be greater than 0");
            }

            if (pageSize < 1 || pageSize > 100)
            {
                return Results.BadRequest("PageSize must be between 1 and 100");
            }

            var request = new QueryRequest(categoryId, subcategoryId, page, pageSize);
            Result<Response> result = await GetItemsHandler.HandleAsync(request, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature
        }
    }
}

