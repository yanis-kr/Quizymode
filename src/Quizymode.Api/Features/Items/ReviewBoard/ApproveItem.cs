using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.ReviewBoard;

public static class ApproveItem
{
    public sealed record Response(
        string Id,
        string Category,
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
            app.MapPut("admin/items/{id:guid}/approval", Handler)
                .WithTags("Admin")
                .WithSummary("Approve an item for review (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(id, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => error.Error.Type == ErrorType.NotFound
                    ? CustomResults.NotFound(error.Error.Description, error.Error.Code)
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Guid id,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            Item? item = await db.Items
                .Include(i => i.Category)
                .FirstOrDefaultAsync(i => i.Id == id, cancellationToken);

            if (item is null)
            {
                return Result.Failure<Response>(Error.NotFound("Item.NotFound", "Item not found"));
            }

            // Approve: make it global and remove from review board
            item.IsPrivate = false;
            item.ReadyForReview = false;

            await db.SaveChangesAsync(cancellationToken);

            // Get category name from Category navigation
            string categoryName = item.Category?.Name ?? string.Empty;

            Response response = new Response(
                item.Id.ToString(),
                categoryName,
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
                Error.Problem("Items.ApproveFailed", $"Failed to approve item: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed
        }
    }
}

