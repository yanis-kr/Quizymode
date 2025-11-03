using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Delete;

public static class DeleteItem
{
    public sealed record Request(string Id);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("items/{id}", Handler)
                .WithTags("Items")
                .WithSummary("Delete a quiz item")
                .WithOpenApi()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result result = await HandleAsync(id, db, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                error => result.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }

        internal static async Task<Result> HandleAsync(
            string id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            try
            {
                if (!Guid.TryParse(id, out Guid itemGuid))
                {
                    return Result.Failure(
                        Error.Validation("Item.InvalidId", "Invalid item ID format"));
                }

                Item? item = await db.Items
                    .FirstOrDefaultAsync(i => i.Id == itemGuid, cancellationToken);

                if (item is null)
                {
                    return Result.Failure(
                        Error.NotFound("Item.NotFound", $"Item with id {id} not found"));
                }

                db.Items.Remove(item);
                await db.SaveChangesAsync(cancellationToken);

                return Result.Success();
            }
            catch (Exception ex)
            {
                return Result.Failure(
                    Error.Problem("Item.DeleteFailed", $"Failed to delete item: {ex.Message}"));
            }
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

