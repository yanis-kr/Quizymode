using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Items;

public static class GetItemCollections
{
    public sealed record CollectionResponse(string Id, string Name, DateTime CreatedAt);

    public sealed record Response(List<CollectionResponse> Collections);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("items/{itemId:guid}/collections", Handler)
                .WithTags("Items")
                .WithSummary("Get collections that contain a specific item")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid itemId,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            Result<Response> result = await HandleAsync(itemId, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Guid itemId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            // Verify item exists
            bool itemExists = await db.Items.AnyAsync(i => i.Id == itemId, cancellationToken);
            if (!itemExists)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Item.NotFound", $"Item with id {itemId} not found"));
            }

            string userId = userContext.UserId!;

            // Get collections that contain this item, filtered by user ownership
            var collections = await db.CollectionItems
                .Where(ci => ci.ItemId == itemId)
                .Join(db.Collections, ci => ci.CollectionId, c => c.Id, (ci, c) => c)
                .Where(c => c.CreatedBy == userId || userContext.IsAdmin)
                .Select(c => new CollectionResponse(
                    c.Id.ToString(),
                    c.Name,
                    c.CreatedAt))
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync(cancellationToken);

            return Result.Success(new Response(collections));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("ItemCollections.GetFailed", $"Failed to get collections for item: {ex.Message}"));
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

