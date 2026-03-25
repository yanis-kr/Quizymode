using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class UnbookmarkCollection
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("collections/{id:guid}/bookmark", Handler)
                .WithTags("Collections")
                .WithSummary("Remove bookmark from a collection")
                .RequireAuthorization()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            Result result = await HandleAsync(id, db, userContext, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result> HandleAsync(
        Guid collectionId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = userContext.UserId!;
            var bookmark = await db.CollectionBookmarks
                .FirstOrDefaultAsync(b => b.UserId == userId && b.CollectionId == collectionId, cancellationToken);

            if (bookmark is null)
            {
                return Result.Success();
            }

            db.CollectionBookmarks.Remove(bookmark);
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("Collections.UnbookmarkFailed", $"Failed to remove bookmark: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services
        }
    }
}
