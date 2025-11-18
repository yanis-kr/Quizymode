using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class GetCollectionItems
{
    public sealed record ItemResponse(
        string Id,
        string Category,
        string Subcategory,
        bool IsPrivate,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt);

    public sealed record Response(List<ItemResponse> Items);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/{collectionId:guid}/items", Handler)
                .WithTags("Collections")
                .WithSummary("Get items in a collection")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid collectionId,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated)
            {
                return Results.Unauthorized();
            }

            Result<Response> result = await HandleAsync(collectionId, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : failure.Error.Type == ErrorType.Validation
                        ? Results.StatusCode(StatusCodes.Status403Forbidden)
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
            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);

            if (collection is null)
            {
                return Result.Failure<Response>(Error.NotFound("Collection.NotFound", "Collection not found"));
            }

            // Authorization: allow if user is owner or admin
            var subject = userContext.UserId;
            if (collection.CreatedBy != subject && !userContext.IsAdmin)
            {
                return Result.Failure<Response>(Error.Validation("Collection.AccessDenied", "Access denied"));
            }

            // Get items linked to collection
            var joins = await db.CollectionItems
                .Where(ci => ci.CollectionId == collectionId)
                .Join(db.Items, ci => ci.ItemId, i => i.Id, (ci, i) => i)
                .Select(i => new ItemResponse(
                    i.Id.ToString(),
                    i.Category,
                    i.Subcategory,
                    i.IsPrivate,
                    i.Question,
                    i.CorrectAnswer,
                    i.IncorrectAnswers,
                    i.Explanation,
                    i.CreatedAt))
                .ToListAsync(cancellationToken);

            return Result.Success(new Response(joins));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(Error.Problem("CollectionItems.GetFailed", $"Failed to get items: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services
        }
    }
}
