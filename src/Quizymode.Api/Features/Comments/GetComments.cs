using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Comments;

/// <summary>
/// Retrieves comments, optionally filtered by item id.
/// </summary>
public static class GetComments
{
    public sealed record QueryRequest(Guid? ItemId);

    public sealed record CommentResponse(
        string Id,
        Guid ItemId,
        string Text,
        string CreatedBy,
        string? CreatedByName,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    public sealed record Response(List<CommentResponse> Comments);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("comments", Handler)
                .WithTags("Comments")
                .WithSummary("Get comments")
                .WithDescription("Returns comments. Optionally filter by itemId using ?itemId={guid}.")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid? itemId,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(itemId);

            Result<Response> result = await HandleAsync(request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<Comment> query = db.Comments.AsNoTracking();

            if (request.ItemId.HasValue && request.ItemId.Value != Guid.Empty)
            {
                // #293: an explicit item id must be readable by the caller; otherwise same as a missing id.
                bool interactable = await ItemVisibility.InteractableBy(db, userContext)
                    .AnyAsync(i => i.Id == request.ItemId.Value, cancellationToken);
                if (!interactable)
                {
                    return Result.Failure<Response>(
                        Error.NotFound("Comments.ItemNotFound", $"Item with id {request.ItemId.Value} not found"));
                }

                query = query.Where(c => c.ItemId == request.ItemId.Value);
            }
            else
            {
                // #285: listing all comments only exposes comments on items the caller can access by id.
                IQueryable<Guid> accessibleItemIds = db.Items
                    .Where(ItemVisibility.AccessibleById(userContext))
                    .Select(i => i.Id);
                query = query.Where(c => accessibleItemIds.Contains(c.ItemId));
            }

            List<Comment> comments = await query
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync(cancellationToken);

            // Get unique user IDs from comments and fetch user names
            List<Guid> userIds = comments
                .Select(c => c.CreatedBy)
                .Where(id => Guid.TryParse(id, out _))
                .Select(id => Guid.Parse(id))
                .Distinct()
                .ToList();

            Dictionary<string, string?> userNamesMap = new();
            if (userIds.Count > 0)
            {
                List<User> users = await db.Users
                    .Where(u => userIds.Contains(u.Id))
                    .ToListAsync(cancellationToken);

                userNamesMap = users.ToDictionary(
                    u => u.Id.ToString(),
                    u => u.Name);
            }

            List<CommentResponse> responseItems = comments
                .Select(c => new CommentResponse(
                    c.Id.ToString(),
                    c.ItemId,
                    c.Text,
                    c.CreatedBy,
                    userNamesMap.TryGetValue(c.CreatedBy, out string? name) ? name : null,
                    c.CreatedAt,
                    c.UpdatedAt))
                .ToList();

            Response response = new(responseItems);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Comments.GetFailed", "Failed to get comments.", ex));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No additional services required.
        }
    }
}

