using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class DeleteCollection
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("collections/{id}", Handler)
                .WithTags("Collections")
                .WithSummary("Delete a collection")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result result = await HandleAsync(id, db, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result> HandleAsync(
        string id,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid collectionId))
            {
                return Result.Failure(
                    Error.Validation("Collection.InvalidId", "Invalid collection ID format"));
            }

            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);

            if (collection is null)
            {
                return Result.Failure(
                    Error.NotFound("Collection.NotFound", $"Collection with id {id} not found"));
            }

            // Remove related collection items first
            List<CollectionItem> collectionItems = await db.CollectionItems
                .Where(ci => ci.CollectionId == collectionId)
                .ToListAsync(cancellationToken);

            if (collectionItems.Count > 0)
            {
                db.CollectionItems.RemoveRange(collectionItems);
            }

            db.Collections.Remove(collection);
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("Collections.DeleteFailed", $"Failed to delete collection: {ex.Message}"));
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


