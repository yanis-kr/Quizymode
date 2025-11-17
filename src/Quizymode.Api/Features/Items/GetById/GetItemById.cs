using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.GetById;

public static class GetItemById
{
    public sealed record Response(
        string Id,
        string Category,
        string Subcategory,
        bool IsPrivate,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
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
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(id, db, cancellationToken);

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
                .FirstOrDefaultAsync(i => i.Id == itemId, cancellationToken);

            if (item is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Item.NotFound", $"Item with id {id} not found"));
            }

            Response response = new(
                item.Id.ToString(),
                item.Category,
                item.Subcategory,
                item.IsPrivate,
                item.Question,
                item.CorrectAnswer,
                item.IncorrectAnswers,
                item.Explanation,
                item.CreatedAt);

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


