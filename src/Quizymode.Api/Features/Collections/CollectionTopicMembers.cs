using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

/// <summary>
/// Topic members (#553): a collection can contain a taxonomy path (Category / Keyword1 [/ Keyword2]).
/// Writes are owner-only and only accept public paths that exist. Reads report whether the path still exists and how many
/// questions the viewer can see on it, and flag a topic above 500 questions (a warning only; nothing is truncated).
/// </summary>
public static class CollectionTopicMembers
{
    /// <summary>Visible-question count above which a topic is flagged as large (#549). Never truncates.</summary>
    public const int LargeTopicThreshold = 500;

    public sealed record AddRequest(Guid CategoryId, Guid Keyword1Id, Guid? Keyword2Id);

    public sealed record TopicMemberResponse(
        string Id,
        Guid CategoryId,
        Guid Keyword1Id,
        Guid? Keyword2Id,
        string CategoryName,
        string Keyword1Name,
        string? Keyword2Name,
        bool IsRemoved,
        int VisibleItemCount,
        bool ExceedsWarningThreshold,
        DateTime AddedAt);

    public sealed class AddRequestValidator : AbstractValidator<AddRequest>
    {
        public AddRequestValidator()
        {
            RuleFor(x => x.CategoryId).NotEqual(Guid.Empty).WithMessage("CategoryId is required.");
            RuleFor(x => x.Keyword1Id).NotEqual(Guid.Empty).WithMessage("Keyword1Id is required.");
            RuleFor(x => x.Keyword2Id)
                .Must(id => id is null || id != Guid.Empty)
                .WithMessage("Keyword2Id must be a valid id when set.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections/{collectionId:guid}/topics", AddHandler)
                .WithTags("Collections")
                .WithSummary("Add a topic to a collection")
                .WithDescription("Adds a public taxonomy path to a collection. Body: { \"categoryId\": \"<guid>\", \"keyword1Id\": \"<guid>\", \"keyword2Id\": \"<guid>\" | null }.")
                .RequireAuthorization()
                .Produces<TopicMemberResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);

            app.MapGet("collections/{collectionId:guid}/topics", ListHandler)
                .WithTags("Collections")
                .WithSummary("List the topics of a collection")
                .WithDescription("Lists topic members with whether each path still exists and the number of questions the caller can see on it.")
                .Produces<List<TopicMemberResponse>>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);

            app.MapDelete("collections/{collectionId:guid}/topics/{memberId:guid}", RemoveHandler)
                .WithTags("Collections")
                .WithSummary("Remove a topic from a collection")
                .WithDescription("Removes a topic member. The taxonomy path itself is not changed.")
                .RequireAuthorization()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
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

            Result<TopicMemberResponse> result = await HandleAddAsync(collectionId, request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/collections/{collectionId}/topics/{value.Id}", value),
                failure => failure.Error.Code == CollectionWriteAccess.ForbiddenCode
                    ? CollectionWriteAccess.ForbiddenResult(failure.Error)
                    : failure.Error.Type == ErrorType.NotFound
                        ? Results.NotFound()
                        : CustomResults.Problem(result, logger));
        }

        private static async Task<IResult> ListHandler(
            Guid collectionId,
            ApplicationDbContext db,
            IUserContext userContext,
            ILogger<Endpoint> logger,
            CancellationToken cancellationToken)
        {
            Result<List<TopicMemberResponse>> result = await HandleListAsync(collectionId, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result, logger));
        }

        private static async Task<IResult> RemoveHandler(
            Guid collectionId,
            Guid memberId,
            ApplicationDbContext db,
            IUserContext userContext,
            ILogger<Endpoint> logger,
            CancellationToken cancellationToken)
        {
            Result result = await HandleRemoveAsync(collectionId, memberId, db, userContext, cancellationToken);

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

    public static async Task<Result<TopicMemberResponse>> HandleAddAsync(
        Guid parentId,
        AddRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Failure<TopicMemberResponse>(
                Error.Validation("CollectionTopics.Unauthorized", "User must be authenticated."));
        }

        Collection? parent = await db.Collections.FirstOrDefaultAsync(c => c.Id == parentId, cancellationToken);
        if (parent is null)
        {
            return Result.Failure<TopicMemberResponse>(
                Error.NotFound("Collection.NotFound", $"Collection with id {parentId} not found"));
        }

        Error? accessError = CollectionWriteAccess.Check(
            parent, userContext, parentId, "Only the collection owner can add or remove topics.");
        if (accessError is not null)
        {
            return Result.Failure<TopicMemberResponse>(accessError);
        }

        // Only public, existing paths can be added. A private or missing path is 404 so it cannot be probed.
        bool pathIsPublic = await PublicPathExistsAsync(db, request.CategoryId, request.Keyword1Id, request.Keyword2Id, cancellationToken);
        if (!pathIsPublic)
        {
            return Result.Failure<TopicMemberResponse>(
                Error.NotFound("Topic.NotFound", "Topic not found."));
        }

        CollectionKeywordMember? existing = await db.CollectionKeywordMembers.FirstOrDefaultAsync(
            m => m.ParentId == parent.Id
                && m.CategoryId == request.CategoryId
                && m.Keyword1Id == request.Keyword1Id
                && m.Keyword2Id == request.Keyword2Id,
            cancellationToken);

        if (existing is null)
        {
            int itemRows = await db.CollectionItems.CountAsync(ci => ci.CollectionId == parent.Id, cancellationToken);
            int childRows = await db.CollectionCollectionMembers.CountAsync(m => m.ParentId == parent.Id, cancellationToken);
            int topicRows = await db.CollectionKeywordMembers.CountAsync(m => m.ParentId == parent.Id, cancellationToken);
            if (itemRows + childRows + topicRows >= CollectionMembers.MaxMembershipRows)
            {
                return Result.Failure<TopicMemberResponse>(
                    Error.Validation("CollectionMembers.TooManyRows", $"A collection can hold at most {CollectionMembers.MaxMembershipRows} members."));
            }

            existing = new CollectionKeywordMember
            {
                Id = Guid.NewGuid(),
                ParentId = parent.Id,
                CategoryId = request.CategoryId,
                Keyword1Id = request.Keyword1Id,
                Keyword2Id = request.Keyword2Id,
                AddedAt = DateTime.UtcNow
            };
            db.CollectionKeywordMembers.Add(existing);
            await db.SaveChangesAsync(cancellationToken);
        }

        // Idempotent: an existing link is returned as is.
        return Result.Success(await BuildResponseAsync(db, existing, userContext, cancellationToken));
    }

    public static async Task<Result<List<TopicMemberResponse>>> HandleListAsync(
        Guid collectionId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Collection? collection = await db.Collections.FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);
        if (collection is null || !GetCollectionById.CanAccess(collection, userContext))
        {
            return Result.Failure<List<TopicMemberResponse>>(
                Error.NotFound("Collection.NotFound", $"Collection with id {collectionId} not found"));
        }

        List<CollectionKeywordMember> members = await db.CollectionKeywordMembers
            .Where(m => m.ParentId == collectionId)
            .OrderBy(m => m.AddedAt)
            .ToListAsync(cancellationToken);

        List<TopicMemberResponse> responses = new(members.Count);
        foreach (CollectionKeywordMember member in members)
        {
            responses.Add(await BuildResponseAsync(db, member, userContext, cancellationToken));
        }

        return Result.Success(responses);
    }

    public static async Task<Result> HandleRemoveAsync(
        Guid parentId,
        Guid memberId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Failure(Error.Validation("CollectionTopics.Unauthorized", "User must be authenticated."));
        }

        Collection? parent = await db.Collections.FirstOrDefaultAsync(c => c.Id == parentId, cancellationToken);
        if (parent is null)
        {
            return Result.Failure(Error.NotFound("Collection.NotFound", $"Collection with id {parentId} not found"));
        }

        Error? accessError = CollectionWriteAccess.Check(
            parent, userContext, parentId, "Only the collection owner can add or remove topics.");
        if (accessError is not null)
        {
            return Result.Failure(accessError);
        }

        CollectionKeywordMember? member = await db.CollectionKeywordMembers
            .FirstOrDefaultAsync(m => m.Id == memberId && m.ParentId == parentId, cancellationToken);
        if (member is null)
        {
            return Result.Failure(Error.NotFound("CollectionTopics.NotFound", "Topic is not a member of this collection."));
        }

        db.CollectionKeywordMembers.Remove(member);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }

    /// <summary>True when the category is public and the keyword path exists as public relations (L1, and L2 under L1 when set).</summary>
    private static async Task<bool> PublicPathExistsAsync(
        ApplicationDbContext db, Guid categoryId, Guid keyword1Id, Guid? keyword2Id, CancellationToken cancellationToken)
    {
        bool categoryPublic = await db.Categories.AnyAsync(c => c.Id == categoryId && !c.IsPrivate, cancellationToken);
        if (!categoryPublic)
        {
            return false;
        }

        bool level1 = await db.KeywordRelations.AnyAsync(r =>
            r.CategoryId == categoryId && r.ParentKeywordId == null && r.ChildKeywordId == keyword1Id, cancellationToken);
        if (!level1)
        {
            return false;
        }

        if (keyword2Id is null)
        {
            return true;
        }

        return await db.KeywordRelations.AnyAsync(r =>
            r.CategoryId == categoryId && r.ParentKeywordId == keyword1Id && r.ChildKeywordId == keyword2Id.Value, cancellationToken);
    }

    /// <summary>Live-path check and visible count for one member. Uses the same visibility as item reads (I3 is not applied to topics).</summary>
    private static async Task<TopicMemberResponse> BuildResponseAsync(
        ApplicationDbContext db, CollectionKeywordMember member, IUserContext userContext, CancellationToken cancellationToken)
    {
        string? viewerId = userContext.IsAuthenticated ? userContext.UserId : null;

        bool isRemoved = !await PublicPathExistsAsync(db, member.CategoryId, member.Keyword1Id, member.Keyword2Id, cancellationToken);

        // A removed path resolves to nothing (same rule as the item resolver), so it counts 0.
        int visibleCount = isRemoved ? 0 : await TopicItems(db, member, viewerId).CountAsync(cancellationToken);

        // Names are shown next to the path. A missing name falls back to an empty string, never to the id.
        string categoryName = await db.Categories
            .Where(c => c.Id == member.CategoryId)
            .Select(c => c.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;
        string keyword1Name = await db.Keywords
            .Where(k => k.Id == member.Keyword1Id)
            .Select(k => k.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;
        string? keyword2Name = member.Keyword2Id is Guid keyword2Id
            ? await db.Keywords.Where(k => k.Id == keyword2Id).Select(k => k.Name).FirstOrDefaultAsync(cancellationToken)
            : null;

        return new TopicMemberResponse(
            member.Id.ToString(),
            member.CategoryId,
            member.Keyword1Id,
            member.Keyword2Id,
            categoryName,
            keyword1Name,
            keyword2Name,
            isRemoved,
            visibleCount,
            visibleCount > LargeTopicThreshold,
            member.AddedAt);
    }

    /// <summary>Questions on this path that the viewer may see (owner's own private matches included, nobody else's).</summary>
    private static IQueryable<Item> TopicItems(ApplicationDbContext db, CollectionKeywordMember member, string? viewerId) =>
        db.Items
            .Where(ItemVisibility.VisibleTo(viewerId))
            .Where(i => i.CategoryId == member.CategoryId
                && i.NavigationKeywordId1 == member.Keyword1Id
                && (member.Keyword2Id == null || i.NavigationKeywordId2 == member.Keyword2Id));
}
