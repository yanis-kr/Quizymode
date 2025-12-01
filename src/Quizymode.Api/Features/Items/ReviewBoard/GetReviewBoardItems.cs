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
                .OrderByDescending(i => i.CreatedAt)
                .Select(i => new ItemResponse(
                    i.Id.ToString(),
                    i.Category,
                    i.Subcategory,
                    i.IsPrivate,
                    i.Question,
                    i.CorrectAnswer,
                    i.IncorrectAnswers,
                    i.Explanation,
                    i.CreatedBy,
                    i.CreatedAt))
                .ToListAsync(cancellationToken);

            return Result.Success(new Response(items));
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

