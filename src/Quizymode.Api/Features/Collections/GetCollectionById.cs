using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class GetCollectionById
{
    public sealed record Response(
        string Id,
        string Name,
        string? Description,
        string CreatedBy,
        DateTime CreatedAt,
        int ItemCount,
        bool IsPublic,
        bool IsDiscoverable,
        int HiddenCollectionCount);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/{id:guid}", Handler)
                .WithTags("Collections")
                .WithSummary("Get a collection by ID")
                .WithDescription("View collection by ID. Allowed if collection is public or you are the owner. Otherwise 404.")
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
        Guid id,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (collection is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Collection.NotFound", "Collection not found"));
            }

            if (!await CanAccessCollectionAsync(db, collection, userContext, cancellationToken))
            {
                return Result.Failure<Response>(
                    Error.NotFound("Collection.NotFound", "Collection not found"));
            }

            // Items with unapproved uploaded pictures count only for their creator (#400).
            // Distinct items of the collection and its accessible nested collections (#552, deduplicated by item id).
            // Membership rows with no item row still count, as before; items hidden by media eligibility do not.
            string? viewerId = userContext.IsAuthenticated ? userContext.UserId : null;
            string callerId = viewerId ?? string.Empty;
            bool hasCaller = callerId.Length > 0;
            IQueryable<Guid> memberItemIds = CollectionScope.AccessibleMemberItemIds(db, id, viewerId);
            int itemCount = await memberItemIds.CountAsync(
                itemId => !db.Items.Any(i => i.Id == itemId
                    && !(hasCaller && i.CreatedBy == callerId)
                    && i.ImageReviewState != null
                    && i.ImageReviewState != ItemImageReviewState.Approved),
                cancellationToken);

            // Direct child links the caller cannot open (#554). Counts links only: no names, ids, questions or descendants.
            int hiddenCollectionCount = await CountHiddenChildLinksAsync(db, id, viewerId, cancellationToken);

            Response response = new(
                collection.Id.ToString(),
                collection.Name,
                collection.Description,
                collection.CreatedBy,
                collection.CreatedAt,
                itemCount,
                collection.IsPublic,
                collection.IsDiscoverable,
                hiddenCollectionCount);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collection.GetFailed", "Failed to get collection.", ex));
        }
    }

    /// <summary>
    /// User can access if collection is public or they are the owner.
    /// </summary>
    internal static Task<bool> CanAccessCollectionAsync(
        ApplicationDbContext db,
        Collection collection,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        return Task.FromResult(CanAccess(collection, userContext));
    }

    internal static bool CanAccess(Collection collection, IUserContext userContext)
    {
        if (collection.IsPublic)
            return true;

        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            return false;

        return collection.CreatedBy == userContext.UserId;
    }

    /// <summary>
    /// Direct child links of <paramref name="parentId"/> whose child is private and not owned by the viewer (#554).
    /// One count query. Hidden descendants are never visited, because only direct links are counted.
    /// </summary>
    internal static Task<int> CountHiddenChildLinksAsync(ApplicationDbContext db, Guid parentId, string? viewerId, CancellationToken cancellationToken)
    {
        string callerId = viewerId ?? string.Empty;
        bool hasCaller = callerId.Length > 0;
        return db.CollectionCollectionMembers.CountAsync(m => m.ParentId == parentId
            && db.Collections.Any(c => c.Id == m.ChildId && !c.IsPublic && !(hasCaller && c.CreatedBy == callerId)),
            cancellationToken);
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services
        }
    }
}

