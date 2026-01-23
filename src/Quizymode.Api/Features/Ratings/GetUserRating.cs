using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Ratings;

/// <summary>
/// Retrieves the current user's rating for a specific item.
/// </summary>
public static class GetUserRating
{
    public sealed record QueryRequest(Guid ItemId);

    public sealed record RatingResponse(
        string Id,
        Guid ItemId,
        int? Stars,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("ratings/{itemId}/me", Handler)
                .WithTags("Ratings")
                .WithSummary("Get current user's rating for an item")
                .WithDescription("Returns the current user's rating for the specified item. Returns null if no rating exists.")
                .RequireAuthorization()
                .Produces<RatingResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Guid itemId,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            if (itemId == Guid.Empty)
            {
                return CustomResults.BadRequest("ItemId is required");
            }

            QueryRequest request = new(itemId);

            Result<RatingResponse?> result = await HandleAsync(request, db, userContext, cancellationToken);

            return result.Match(
                value => value is null ? Results.Ok((RatingResponse?)null) : Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<RatingResponse?>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                return Result.Failure<RatingResponse?>(
                    Error.Validation("Ratings.UserIdMissing", "User ID is missing"));
            }

            Rating? rating = await db.Ratings
                .FirstOrDefaultAsync(
                    r => r.ItemId == request.ItemId && r.CreatedBy == userContext.UserId,
                    cancellationToken);

            if (rating is null)
            {
                return Result.Success<RatingResponse?>(null);
            }

            RatingResponse response = new(
                rating.Id.ToString(),
                rating.ItemId,
                rating.Stars,
                rating.CreatedAt,
                rating.UpdatedAt);

            return Result.Success<RatingResponse?>(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<RatingResponse?>(
                Error.Problem("Ratings.GetUserRatingFailed", $"Failed to get user rating: {ex.Message}"));
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

