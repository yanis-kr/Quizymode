using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

/// <summary>
/// Nested collections (#552): a collection can contain other collections. Writes are checked in the order of invariant C5:
/// parent access, then child visibility, then self-link, cycle, depth and the row cap.
/// </summary>
public static class CollectionMembers
{
    /// <summary>Longest chain of links allowed from a top collection to its deepest member (#549 safety limit).</summary>
    public const int MaxDepth = 3;

    /// <summary>Membership rows (item rows plus child collections) per collection (#549 safety limit).</summary>
    public const int MaxMembershipRows = 500;

    /// <summary>Collections (the root included) one read resolves at most; beyond this the response is marked incomplete (AC 1.16.6).</summary>
    public const int MaxReadCollections = 50;

    public sealed record AddRequest(Guid ChildCollectionId);

    public sealed record CollectionMemberResponse(string Id, Guid ParentId, Guid ChildId, DateTime AddedAt);

    /// <summary>A child collection the caller can open. <paramref name="HiddenFromOthers"/> is true for the owner's own private child (#554).</summary>
    public sealed record ChildCollection(string Id, string Name, bool IsPublic, bool HiddenFromOthers, DateTime AddedAt);

    /// <summary>Accessible children only. Inaccessible children are a count, with no name, id or order (#554).</summary>
    public sealed record ChildrenResponse(List<ChildCollection> Children, int HiddenCollectionCount);

    public sealed class AddRequestValidator : AbstractValidator<AddRequest>
    {
        public AddRequestValidator()
        {
            RuleFor(x => x.ChildCollectionId)
                .NotEqual(Guid.Empty)
                .WithMessage("ChildCollectionId is required.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/{collectionId:guid}/collections", ChildrenHandler)
                .WithTags("Collections")
                .WithSummary("List the accessible child collections")
                .WithDescription("Lists child collections the caller can open, plus a count of child links they cannot open. Hidden children have no name, id or order.")
                .Produces<ChildrenResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);

            app.MapPost("collections/{collectionId:guid}/collections", AddHandler)
                .WithTags("Collections")
                .WithSummary("Add a collection to a collection")
                .WithDescription("Makes a collection a member of another collection. Body: { \"childCollectionId\": \"<guid>\" }. Rejects cycles and depth over the cap with 400.")
                .RequireAuthorization()
                .Produces<CollectionMemberResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);

            app.MapDelete("collections/{collectionId:guid}/collections/{childId:guid}", RemoveHandler)
                .WithTags("Collections")
                .WithSummary("Remove a collection from a collection")
                .WithDescription("Removes a nested collection from its parent. The child collection itself is not deleted.")
                .RequireAuthorization()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> ChildrenHandler(
            Guid collectionId,
            ApplicationDbContext db,
            IUserContext userContext,
            ILogger<Endpoint> logger,
            CancellationToken cancellationToken)
        {
            Result<ChildrenResponse> result = await HandleChildrenAsync(collectionId, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result, logger));
        }

        private static async Task<IResult> AddHandler(
            Guid collectionId,
            AddRequest request,
            IValidator<AddRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ILogger<Endpoint> logger,
            CancellationToken cancellationToken)
        {
            ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<CollectionMemberResponse> result = await HandleAddAsync(collectionId, request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/collections/{value.ParentId}/collections/{value.ChildId}", value),
                failure => failure.Error.Code == CollectionWriteAccess.ForbiddenCode
                    ? CollectionWriteAccess.ForbiddenResult(failure.Error)
                    : failure.Error.Type == ErrorType.NotFound
                        ? Results.NotFound()
                        : CustomResults.Problem(result, logger));
        }

        private static async Task<IResult> RemoveHandler(
            Guid collectionId,
            Guid childId,
            ApplicationDbContext db,
            IUserContext userContext,
            ILogger<Endpoint> logger,
            CancellationToken cancellationToken)
        {
            Result result = await HandleRemoveAsync(collectionId, childId, db, userContext, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Code == CollectionWriteAccess.ForbiddenCode
                    ? CollectionWriteAccess.ForbiddenResult(failure.Error)
                    : failure.Error.Type == ErrorType.NotFound
                        ? Results.NotFound()
                        : CustomResults.Problem(result, logger));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<AddRequest>, AddRequestValidator>();
        }
    }

    /// <summary>
    /// Children of a collection the caller can open (the parent must be accessible), plus the hidden-link count (#554).
    /// Children are listed only when the child is public or owned by the caller, in the same rule the resolver uses.
    /// </summary>
    public static async Task<Result<ChildrenResponse>> HandleChildrenAsync(
        Guid parentId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Collection? parent = await db.Collections.FirstOrDefaultAsync(c => c.Id == parentId, cancellationToken);
        if (parent is null || !GetCollectionById.CanAccess(parent, userContext))
        {
            return Result.Failure<ChildrenResponse>(
                Error.NotFound("Collection.NotFound", $"Collection with id {parentId} not found"));
        }

        string? viewerId = userContext.IsAuthenticated ? userContext.UserId : null;
        string callerId = viewerId ?? string.Empty;
        bool hasCaller = callerId.Length > 0;

        var rows = await db.CollectionCollectionMembers
            .Where(m => m.ParentId == parentId)
            .Join(
                db.Collections.Where(c => c.IsPublic || (hasCaller && c.CreatedBy == callerId)),
                m => m.ChildId,
                c => c.Id,
                (m, c) => new { c.Id, c.Name, c.IsPublic, c.CreatedBy, m.AddedAt })
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        // Ids are formatted here, not in SQL, so the string form matches the other collection responses.
        List<ChildCollection> children = rows
            .Select(x => new ChildCollection(
                x.Id.ToString(),
                x.Name,
                x.IsPublic,
                !x.IsPublic && hasCaller && x.CreatedBy == callerId,
                x.AddedAt))
            .ToList();

        int hidden = await GetCollectionById.CountHiddenChildLinksAsync(db, parentId, viewerId, cancellationToken);

        return Result.Success(new ChildrenResponse(children, hidden));
    }

    public static async Task<Result<CollectionMemberResponse>> HandleAddAsync(
        Guid parentId,
        AddRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Failure<CollectionMemberResponse>(
                Error.Validation("CollectionMembers.Unauthorized", "User must be authenticated."));
        }

        Collection? parent = await db.Collections.FirstOrDefaultAsync(c => c.Id == parentId, cancellationToken);
        if (parent is null)
        {
            return Result.Failure<CollectionMemberResponse>(
                Error.NotFound("Collection.NotFound", $"Collection with id {parentId} not found"));
        }

        Error? accessError = CollectionWriteAccess.Check(
            parent, userContext, parentId, "Only the collection owner can add or remove members.");
        if (accessError is not null)
        {
            return Result.Failure<CollectionMemberResponse>(accessError);
        }

        Collection? child = await db.Collections.FirstOrDefaultAsync(c => c.Id == request.ChildCollectionId, cancellationToken);
        if (child is null || !GetCollectionById.CanAccess(child, userContext))
        {
            return Result.Failure<CollectionMemberResponse>(
                Error.NotFound("Collection.NotFound", $"Collection with id {request.ChildCollectionId} not found"));
        }

        if (child.Id == parent.Id)
        {
            return Result.Failure<CollectionMemberResponse>(
                Error.Validation("CollectionMembers.Cycle", "A collection cannot contain itself."));
        }

        CollectionCollectionMember? existing = await db.CollectionCollectionMembers
            .FirstOrDefaultAsync(m => m.ParentId == parent.Id && m.ChildId == child.Id, cancellationToken);
        if (existing is not null)
        {
            // Idempotent, as for item links.
            return Result.Success(new CollectionMemberResponse(existing.Id.ToString(), existing.ParentId, existing.ChildId, existing.AddedAt));
        }

        int itemRows = await db.CollectionItems.CountAsync(ci => ci.CollectionId == parent.Id, cancellationToken);
        int childRows = await db.CollectionCollectionMembers.CountAsync(m => m.ParentId == parent.Id, cancellationToken);
        int topicRows = await db.CollectionKeywordMembers.CountAsync(m => m.ParentId == parent.Id, cancellationToken);
        if (itemRows + childRows + topicRows >= MaxMembershipRows)
        {
            return Result.Failure<CollectionMemberResponse>(
                Error.Validation("CollectionMembers.TooManyRows", $"A collection can hold at most {MaxMembershipRows} members."));
        }

        // Cycle: the child's subtree reaches the parent. Depth: links above the parent, plus this link, plus the child's subtree.
        (int heightBelowChild, bool reachesParent) = await WalkDownAsync(db, child.Id, parent.Id, cancellationToken);
        if (reachesParent)
        {
            return Result.Failure<CollectionMemberResponse>(
                Error.Validation("CollectionMembers.Cycle", "This link would make a collection contain itself."));
        }

        int heightAboveParent = await WalkUpAsync(db, parent.Id, cancellationToken);
        if (heightAboveParent + 1 + heightBelowChild > MaxDepth)
        {
            return Result.Failure<CollectionMemberResponse>(
                Error.Validation("CollectionMembers.TooDeep", $"Collections can nest at most {MaxDepth} levels deep."));
        }

        CollectionCollectionMember entity = new()
        {
            Id = Guid.NewGuid(),
            ParentId = parent.Id,
            ChildId = child.Id,
            AddedAt = DateTime.UtcNow
        };

        db.CollectionCollectionMembers.Add(entity);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new CollectionMemberResponse(entity.Id.ToString(), entity.ParentId, entity.ChildId, entity.AddedAt));
    }

    public static async Task<Result> HandleRemoveAsync(
        Guid parentId,
        Guid childId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Failure(Error.Validation("CollectionMembers.Unauthorized", "User must be authenticated."));
        }

        Collection? parent = await db.Collections.FirstOrDefaultAsync(c => c.Id == parentId, cancellationToken);
        if (parent is null)
        {
            return Result.Failure(Error.NotFound("Collection.NotFound", $"Collection with id {parentId} not found"));
        }

        Error? accessError = CollectionWriteAccess.Check(
            parent, userContext, parentId, "Only the collection owner can add or remove members.");
        if (accessError is not null)
        {
            return Result.Failure(accessError);
        }

        CollectionCollectionMember? link = await db.CollectionCollectionMembers
            .FirstOrDefaultAsync(m => m.ParentId == parentId && m.ChildId == childId, cancellationToken);
        if (link is null)
        {
            return Result.Failure(Error.NotFound("CollectionMembers.NotFound", "Collection is not a member of this collection."));
        }

        db.CollectionCollectionMembers.Remove(link);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }

    /// <summary>
    /// Breadth-first walk down from <paramref name="startId"/>, bounded by <see cref="MaxDepth"/> + 1 levels and a visited set,
    /// so a cycle already stored in the data still terminates. Returns the number of levels reached (capped) and whether
    /// <paramref name="targetId"/> is reached.
    /// </summary>
    private static async Task<(int Height, bool ReachesTarget)> WalkDownAsync(
        ApplicationDbContext db, Guid startId, Guid targetId, CancellationToken cancellationToken)
    {
        HashSet<Guid> seen = [startId];
        List<Guid> frontier = [startId];
        int height = 0;

        for (int level = 1; level <= MaxDepth + 1 && frontier.Count > 0; level++)
        {
            List<Guid> next = (await db.CollectionCollectionMembers
                    .Where(m => frontier.Contains(m.ParentId))
                    .Select(m => m.ChildId)
                    .ToListAsync(cancellationToken))
                .Where(seen.Add)
                .ToList();

            if (next.Contains(targetId))
            {
                return (level, true);
            }

            if (next.Count > 0)
            {
                height = level;
            }

            frontier = next;
        }

        return (height, false);
    }

    /// <summary>Number of links above <paramref name="startId"/> (its longest ancestor chain), capped at <see cref="MaxDepth"/> + 1.</summary>
    private static async Task<int> WalkUpAsync(ApplicationDbContext db, Guid startId, CancellationToken cancellationToken)
    {
        HashSet<Guid> seen = [startId];
        List<Guid> frontier = [startId];
        int height = 0;

        for (int level = 1; level <= MaxDepth + 1 && frontier.Count > 0; level++)
        {
            List<Guid> next = (await db.CollectionCollectionMembers
                    .Where(m => frontier.Contains(m.ChildId))
                    .Select(m => m.ParentId)
                    .ToListAsync(cancellationToken))
                .Where(seen.Add)
                .ToList();

            if (next.Count > 0)
            {
                height = level;
            }

            frontier = next;
        }

        return height;
    }
}
