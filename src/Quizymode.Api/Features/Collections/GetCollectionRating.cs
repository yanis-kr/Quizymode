using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Collections;

public static class GetCollectionRating
{
    public sealed record Response(
        int Count,
        double? AverageStars,
        int? MyStars);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/{id:guid}/rating", Handler)
                .WithTags("Collections")
                .WithSummary("Get collection rating stats and current user's rating")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(id, db, userContext, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Guid collectionId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            bool collectionExists = await db.Collections.AnyAsync(c => c.Id == collectionId, cancellationToken);
            if (!collectionExists)
                return Result.Failure<Response>(Error.NotFound("Collection.NotFound", "Collection not found"));

            var ratings = await db.CollectionRatings
                .Where(r => r.CollectionId == collectionId)
                .ToListAsync(cancellationToken);

            int count = ratings.Count;
            double? averageStars = count > 0
                ? Math.Round(ratings.Average(r => r.Stars), 2)
                : null;

            int? myStars = null;
            if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
            {
                var my = ratings.FirstOrDefault(r => r.CreatedBy == userContext.UserId);
                if (my != null)
                    myStars = my.Stars;
            }

            return Result.Success(new Response(count, averageStars, myStars));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("CollectionRating.GetFailed", ex.Message));
        }
    }
}
