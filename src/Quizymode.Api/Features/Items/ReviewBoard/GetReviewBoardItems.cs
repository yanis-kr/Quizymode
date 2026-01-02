using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Items.ReviewBoard;

public static class GetReviewBoardItems
{
    public sealed record Response(List<ItemResponse> Items);

    public sealed record ItemResponse(
        string Id,
        string Category,
        string Subcategory,
        bool IsPrivate,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        string CreatedBy,
        DateTime CreatedAt);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/items/review-board", Handler)
                .WithTags("Admin")
                .WithSummary("Get items ready for review (Admin only)")
                .RequireAuthorization("Admin")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            var items = await db.Items
                .Where(i => i.ReadyForReview)
                .Include(i => i.CategoryItems)
                .ThenInclude(ci => ci.Category)
                .OrderByDescending(i => i.CreatedAt)
                .ToListAsync(cancellationToken);

            var itemResponses = items.Select(i =>
            {
                string categoryName = i.CategoryItems
                    .Where(ci => ci.Category.Depth == 1)
                    .Select(ci => ci.Category.Name)
                    .FirstOrDefault() ?? string.Empty;

                string subcategoryName = i.CategoryItems
                    .Where(ci => ci.Category.Depth == 2)
                    .Select(ci => ci.Category.Name)
                    .FirstOrDefault() ?? string.Empty;

                return new ItemResponse(
                    i.Id.ToString(),
                    categoryName,
                    subcategoryName,
                    i.IsPrivate,
                    i.Question,
                    i.CorrectAnswer,
                    i.IncorrectAnswers,
                    i.Explanation,
                    i.CreatedBy,
                    i.CreatedAt);
            }).ToList();

            return Result.Success(new Response(itemResponses));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Items.GetReviewBoardFailed", $"Failed to retrieve review board items: {ex.Message}"));
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

