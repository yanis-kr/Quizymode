using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
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
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            Guid? itemId,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(itemId);

            Result<Response> result = await HandleAsync(request, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<Comment> query = db.Comments.AsQueryable();

            if (request.ItemId.HasValue && request.ItemId.Value != Guid.Empty)
            {
                query = query.Where(c => c.ItemId == request.ItemId.Value);
            }

            List<Comment> comments = await query
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync(cancellationToken);

            List<CommentResponse> responseItems = comments
                .Select(c => new CommentResponse(
                    c.Id.ToString(),
                    c.ItemId,
                    c.Text,
                    c.CreatedBy,
                    c.CreatedAt,
                    c.UpdatedAt))
                .ToList();

            Response response = new(responseItems);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Comments.GetFailed", $"Failed to get comments: {ex.Message}"));
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

