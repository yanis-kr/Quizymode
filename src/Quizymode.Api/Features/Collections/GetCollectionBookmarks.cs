using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Collections;

/// <summary>
/// Returns the list of users who bookmarked this collection. Owner only.
/// </summary>
public static class GetCollectionBookmarks
{
    public sealed record BookmarkerItem(string UserId, string? Name, DateTime BookmarkedAt);

    public sealed record Response(List<BookmarkerItem> BookmarkedBy);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/{id:guid}/bookmarks", Handler)
                .WithTags("Collections")
                .WithSummary("List users who bookmarked this collection (owner only)")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                return Results.Unauthorized();

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
            var collection = await db.Collections
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);
            if (collection is null)
                return Result.Failure<Response>(Error.NotFound("Collection.NotFound", "Collection not found"));

            if (collection.CreatedBy != userContext.UserId)
                return Result.Failure<Response>(
                    Error.Validation("Collection.Forbidden", "Only the collection owner can see who bookmarked it."));

            var bookmarks = await db.CollectionBookmarks
                .Where(b => b.CollectionId == collectionId)
                .OrderByDescending(b => b.CreatedAt)
                .ToListAsync(cancellationToken);

            if (bookmarks.Count == 0)
                return Result.Success(new Response(new List<BookmarkerItem>()));

            var userIds = bookmarks
                .Select(b => b.UserId)
                .Where(s => !string.IsNullOrEmpty(s))
                .Distinct()
                .ToList();

            var userGuids = new List<Guid>();
            foreach (var s in userIds)
            {
                if (Guid.TryParse(s, out var g))
                    userGuids.Add(g);
            }

            var users = await db.Users
                .AsNoTracking()
                .Where(u => userGuids.Contains(u.Id))
                .Select(u => new { u.Id, u.Name })
                .ToListAsync(cancellationToken);

            var userMap = users.ToDictionary(u => u.Id.ToString(), u => u.Name);

            var items = bookmarks
                .Select(b => new BookmarkerItem(
                    b.UserId,
                    userMap.GetValueOrDefault(b.UserId),
                    b.CreatedAt))
                .ToList();

            return Result.Success(new Response(items));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("CollectionBookmarks.GetFailed", ex.Message));
        }
    }
}
