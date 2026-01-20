using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

/// <summary>
/// Adds items to a collection and removes them.
/// </summary>
public static class CollectionItems
{
    public sealed record AddRequest(Guid ItemId);

    public sealed record BulkAddRequest(List<Guid> ItemIds);

    public sealed record CollectionItemResponse(
        string Id,
        Guid CollectionId,
        Guid ItemId,
        DateTime AddedAt);

    public sealed record BulkAddResponse(
        int AddedCount,
        int SkippedCount,
        List<string> AddedItemIds);

    public sealed class AddRequestValidator : AbstractValidator<AddRequest>
    {
        public AddRequestValidator()
        {
            RuleFor(x => x.ItemId)
                .NotEqual(Guid.Empty)
                .WithMessage("ItemId is required.");
        }
    }

    public sealed class BulkAddRequestValidator : AbstractValidator<BulkAddRequest>
    {
        public BulkAddRequestValidator()
        {
            RuleFor(x => x.ItemIds)
                .NotNull()
                .WithMessage("ItemIds is required.")
                .NotEmpty()
                .WithMessage("At least one ItemId is required.")
                .Must(ids => ids.All(id => id != Guid.Empty))
                .WithMessage("All ItemIds must be valid GUIDs.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections/{collectionId:guid}/items", AddHandler)
                .WithTags("Collections")
                .WithSummary("Add an item to a collection")
                .WithDescription("Adds a quiz item to a collection. Body: { \"itemId\": \"<guid>\" }.")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<CollectionItemResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);

            app.MapPost("collections/{collectionId:guid}/items/bulk", BulkAddHandler)
                .WithTags("Collections")
                .WithSummary("Add multiple items to a collection")
                .WithDescription("Adds multiple quiz items to a collection. Body: { \"itemIds\": [\"<guid1>\", \"<guid2>\", ...] }.")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<BulkAddResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);

            app.MapDelete("collections/{collectionId:guid}/items/{itemId:guid}", RemoveHandler)
                .WithTags("Collections")
                .WithSummary("Remove an item from a collection")
                .WithDescription("Removes a quiz item from a collection.")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> AddHandler(
            Guid collectionId,
            AddRequest request,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<CollectionItemResponse> result = await HandleAddAsync(
                collectionId,
                request,
                db,
                userContext,
                cancellationToken);

            return result.Match(
                value => Results.Created($"/api/collections/{value.CollectionId}/items/{value.ItemId}", value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }

        private static async Task<IResult> BulkAddHandler(
            Guid collectionId,
            BulkAddRequest request,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<BulkAddResponse> result = await HandleBulkAddAsync(
                collectionId,
                request,
                db,
                userContext,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }

        private static async Task<IResult> RemoveHandler(
            Guid collectionId,
            Guid itemId,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result result = await HandleRemoveAsync(collectionId, itemId, db, userContext, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<CollectionItemResponse>> HandleAddAsync(
        Guid collectionId,
        AddRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!userContext.IsAuthenticated)
            {
                return Result.Failure<CollectionItemResponse>(
                    Error.Validation("CollectionItems.Unauthorized", "User must be authenticated."));
            }

            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);

            if (collection is null)
            {
                return Result.Failure<CollectionItemResponse>(
                    Error.NotFound("Collection.NotFound", $"Collection with id {collectionId} not found"));
            }

            Item? item = await db.Items
                .FirstOrDefaultAsync(i => i.Id == request.ItemId, cancellationToken);

            if (item is null)
            {
                return Result.Failure<CollectionItemResponse>(
                    Error.NotFound("Item.NotFound", $"Item with id {request.ItemId} not found"));
            }

            bool exists = await db.CollectionItems.AnyAsync(
                ci => ci.CollectionId == collectionId && ci.ItemId == request.ItemId,
                cancellationToken);

            if (exists)
            {
                return Result.Failure<CollectionItemResponse>(
                    Error.Conflict("CollectionItems.AlreadyExists", "Item is already in the collection."));
            }

            CollectionItem entity = new()
            {
                Id = Guid.NewGuid(),
                CollectionId = collectionId,
                ItemId = request.ItemId,
                AddedAt = DateTime.UtcNow
            };

            db.CollectionItems.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            CollectionItemResponse response = new(
                entity.Id.ToString(),
                entity.CollectionId,
                entity.ItemId,
                entity.AddedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<CollectionItemResponse>(
                Error.Problem("CollectionItems.AddFailed", $"Failed to add item to collection: {ex.Message}"));
        }
    }

    public static async Task<Result<BulkAddResponse>> HandleBulkAddAsync(
        Guid collectionId,
        BulkAddRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!userContext.IsAuthenticated)
            {
                return Result.Failure<BulkAddResponse>(
                    Error.Validation("CollectionItems.Unauthorized", "User must be authenticated."));
            }

            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);

            if (collection is null)
            {
                return Result.Failure<BulkAddResponse>(
                    Error.NotFound("Collection.NotFound", $"Collection with id {collectionId} not found"));
            }

            // Get existing collection items to skip duplicates
            HashSet<Guid> existingItemIds = await db.CollectionItems
                .Where(ci => ci.CollectionId == collectionId && request.ItemIds.Contains(ci.ItemId))
                .Select(ci => ci.ItemId)
                .ToHashSetAsync(cancellationToken);

            // Filter out items that don't exist
            List<Guid> validItemIds = await db.Items
                .Where(i => request.ItemIds.Contains(i.Id))
                .Select(i => i.Id)
                .ToListAsync(cancellationToken);

            // Get items to add (exist, not already in collection)
            List<Guid> itemIdsToAdd = validItemIds
                .Where(id => !existingItemIds.Contains(id))
                .ToList();

            if (itemIdsToAdd.Count == 0)
            {
                // All items are already in the collection or don't exist
                return Result.Success(new BulkAddResponse(
                    0,
                    request.ItemIds.Count,
                    new List<string>()));
            }

            // Create collection items
            List<CollectionItem> entitiesToAdd = itemIdsToAdd.Select(itemId => new CollectionItem
            {
                Id = Guid.NewGuid(),
                CollectionId = collectionId,
                ItemId = itemId,
                AddedAt = DateTime.UtcNow
            }).ToList();

            db.CollectionItems.AddRange(entitiesToAdd);
            await db.SaveChangesAsync(cancellationToken);

            BulkAddResponse response = new(
                itemIdsToAdd.Count,
                request.ItemIds.Count - itemIdsToAdd.Count,
                itemIdsToAdd.Select(id => id.ToString()).ToList());

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<BulkAddResponse>(
                Error.Problem("CollectionItems.BulkAddFailed", $"Failed to add items to collection: {ex.Message}"));
        }
    }

    public static async Task<Result> HandleRemoveAsync(
        Guid collectionId,
        Guid itemId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!userContext.IsAuthenticated)
            {
                return Result.Failure(
                    Error.Validation("CollectionItems.Unauthorized", "User must be authenticated."));
            }

            CollectionItem? entity = await db.CollectionItems
                .FirstOrDefaultAsync(
                    ci => ci.CollectionId == collectionId && ci.ItemId == itemId,
                    cancellationToken);

            if (entity is null)
            {
                return Result.Failure(
                    Error.NotFound("CollectionItems.NotFound", "Item is not in the collection."));
            }

            db.CollectionItems.Remove(entity);
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("CollectionItems.RemoveFailed", $"Failed to remove item from collection: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<AddRequest>, AddRequestValidator>();
            services.AddScoped<IValidator<BulkAddRequest>, BulkAddRequestValidator>();
        }
    }
}


