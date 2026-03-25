using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class BookmarkCollection
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections/{id:guid}/bookmark", Handler)
                .WithTags("Collections")
                .WithSummary("Bookmark a collection")
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
            var exists = await db.Collections.AnyAsync(c => c.Id == collectionId, cancellationToken);
            if (!exists)
            {
                return Result.Failure(Error.NotFound("Collection.NotFound", "Collection not found"));
            }

            var userId = userContext.UserId!;
            var already = await db.CollectionBookmarks
                .AnyAsync(b => b.UserId == userId && b.CollectionId == collectionId, cancellationToken);
            if (already)
            {
                return Result.Success();
            }

            db.CollectionBookmarks.Add(new CollectionBookmark
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                CollectionId = collectionId,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("Collections.BookmarkFailed", $"Failed to bookmark: {ex.Message}"));
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
