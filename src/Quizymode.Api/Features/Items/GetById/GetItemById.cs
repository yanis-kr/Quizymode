using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.GetById;

public static class GetItemById
{
    public sealed record Response(
        string Id,
        string? Category,
        bool IsPrivate,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt,
        List<KeywordResponse> Keywords,
        List<CollectionResponse> Collections);

    public sealed record KeywordResponse(
        string Id,
        string Name,
        bool IsPrivate);

    public sealed record CollectionResponse(
        string Id,
        string Name,
        DateTime CreatedAt);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("items/{id}", Handler)
                .WithTags("Items")
                .WithSummary("Get a single quiz item by id")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string id,
            ApplicationDbContext db,
            IUserContext userContext = null!,
            CancellationToken cancellationToken = default)
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
        string id,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid itemId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Item.InvalidId", "Invalid item ID format"));
            }

            Item? item = await db.Items
                .Include(i => i.Category)
                .Include(i => i.ItemKeywords)
                    .ThenInclude(ik => ik.Keyword)
                .FirstOrDefaultAsync(i => i.Id == itemId, cancellationToken);

            if (item is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Item.NotFound", $"Item with id {id} not found"));
            }

            // Get category name from Category navigation
            string? categoryName = item.Category?.Name;

            // Filter keywords based on visibility
            List<KeywordResponse> visibleKeywords = new();
            foreach (ItemKeyword itemKeyword in item.ItemKeywords)
            {
                Keyword keyword = itemKeyword.Keyword;
                
                // Check if keyword is visible to current user
                bool isVisible = false;
                if (!keyword.IsPrivate)
                {
                    // Global keyword - visible to everyone
                    isVisible = true;
                }
                else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                {
                    // Private keyword - only visible to creator
                    isVisible = keyword.CreatedBy == userContext.UserId;
                }

                if (isVisible)
                {
                    visibleKeywords.Add(new KeywordResponse(
                        keyword.Id.ToString(),
                        keyword.Name,
                        keyword.IsPrivate));
                }
            }

            // Load collections for this item using authenticated user's ID
            // Collections are filtered by authenticated userId - no collections for anonymous users
            List<CollectionResponse> collections = new();
            if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
            {
                List<Collection> itemCollections = await db.CollectionItems
                    .Where(ci => ci.ItemId == itemId)
                    .Join(db.Collections, ci => ci.CollectionId, c => c.Id, (ci, c) => c)
                    .Where(c => c.CreatedBy == userContext.UserId || userContext.IsAdmin)
                    .OrderByDescending(c => c.CreatedAt)
                    .ToListAsync(cancellationToken);

                collections = itemCollections.Select(c => new CollectionResponse(
                    c.Id.ToString(),
                    c.Name,
                    c.CreatedAt)).ToList();
            }

            Response response = new(
                item.Id.ToString(),
                categoryName,
                item.IsPrivate,
                item.Question,
                item.CorrectAnswer,
                item.IncorrectAnswers,
                item.Explanation,
                item.CreatedAt,
                visibleKeywords,
                collections);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Item.GetFailed", $"Failed to get item: {ex.Message}"));
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


