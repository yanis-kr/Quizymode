using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Ratings;

/// <summary>
/// Retrieves ratings statistics, optionally filtered by item id.
/// </summary>
public static class GetRatings
{
    public sealed record QueryRequest(Guid ItemId);

    public sealed record RatingStatsResponse(
        int Count,
        double? AverageStars,
        Guid? ItemId);

    public sealed record Response(RatingStatsResponse Stats);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("ratings/{itemId}", Handler)
                .WithTags("Ratings")
                .WithSummary("Get ratings statistics")
                .WithDescription("Returns ratings count and average for the specified item.")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid itemId,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(itemId);

            Result<Response> result = await HandleAsync(request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
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
            // #293: same 404 as a missing id when the caller cannot interact with the item.
            bool interactable = await ItemVisibility.InteractableBy(db, userContext)
                .AnyAsync(i => i.Id == request.ItemId, cancellationToken);
            if (!interactable)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Ratings.ItemNotFound", $"Item with id {request.ItemId} not found"));
            }

            IQueryable<Rating> query = db.Ratings
                .AsNoTracking()
                .Where(r => r.ItemId == request.ItemId);

            // Only count ratings that have stars (not null)
            IQueryable<Rating> ratingsWithStars = query.Where(r => r.Stars.HasValue);

            int count = await ratingsWithStars.CountAsync(cancellationToken);
            
            double? averageStars = null;
            if (count > 0)
            {
                double average = await ratingsWithStars
                    .AverageAsync(r => r.Stars!.Value, cancellationToken);
                averageStars = Math.Round(average, 2);
            }

            RatingStatsResponse stats = new(
                count,
                averageStars,
                request.ItemId);

            Response response = new(stats);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Ratings.GetFailed", "Failed to get ratings.", ex));
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

