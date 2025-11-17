using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Reviews;

/// <summary>
/// Retrieves reviews, optionally filtered by item id.
/// </summary>
public static class GetReviews
{
    public sealed record QueryRequest(Guid? ItemId);

    public sealed record ReviewResponse(
        string Id,
        Guid ItemId,
        string Reaction,
        string Comment,
        string CreatedBy,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    public sealed record Response(List<ReviewResponse> Reviews);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("reviews", Handler)
                .WithTags("Reviews")
                .WithSummary("Get reviews")
                .WithDescription("Returns reviews. Optionally filter by itemId using ?itemId={guid}.")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            Guid? itemId,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(itemId);

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
            IQueryable<Review> query = db.Reviews.AsQueryable();

            if (request.ItemId.HasValue && request.ItemId.Value != Guid.Empty)
            {
                query = query.Where(r => r.ItemId == request.ItemId.Value);
            }

            List<Review> reviews = await query
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync(cancellationToken);

            List<ReviewResponse> responseItems = reviews
                .Select(r => new ReviewResponse(
                    r.Id.ToString(),
                    r.ItemId,
                    r.Reaction,
                    r.Comment,
                    r.CreatedBy,
                    r.CreatedAt,
                    r.UpdatedAt))
                .ToList();

            Response response = new(responseItems);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Reviews.GetFailed", $"Failed to get reviews: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No additional services required.
        }
    }
}


