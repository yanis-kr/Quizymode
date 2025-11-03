using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Get;

public static class GetCollectionItems
{
    public sealed record Request(string CollectionId);

    public sealed record Response(List<ItemResponse> Items);

    public sealed record ItemResponse(
        string Id,
        string CategoryId,
        string SubcategoryId,
        string Visibility,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/{collectionId}/items", Handler)
                .WithTags("Collections")
                .WithSummary("Get items in a collection")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string collectionId,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(collectionId, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => result.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }

        internal static async Task<Result<Response>> HandleAsync(
            string collectionId,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            try
            {
                if (!Guid.TryParse(collectionId, out Guid collectionGuid))
                {
                    return Result.Failure<Response>(
                        Error.Validation("Collection.InvalidId", "Invalid collection ID format"));
                }

                Collection? collection = await db.Collections
                    .FirstOrDefaultAsync(c => c.Id == collectionGuid, cancellationToken);

                if (collection is null)
                {
                    return Result.Failure<Response>(
                        Error.NotFound("Collection.NotFound", $"Collection with id {collectionId} not found"));
                }

                List<Item> items = await db.Items
                    .Where(i => i.CategoryId == collection.CategoryId && 
                               i.SubcategoryId == collection.SubcategoryId)
                    .ToListAsync(cancellationToken);

                Response response = new Response(
                    items.Select(i => new ItemResponse(
                        i.Id.ToString(),
                        i.CategoryId,
                        i.SubcategoryId,
                        i.Visibility,
                        i.Question,
                        i.CorrectAnswer,
                        i.IncorrectAnswers,
                        i.Explanation,
                        i.CreatedAt)).ToList());

                return Result.Success(response);
            }
            catch (Exception ex)
            {
                return Result.Failure<Response>(
                    Error.Problem("CollectionItems.GetFailed", $"Failed to get collection items: {ex.Message}"));
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

