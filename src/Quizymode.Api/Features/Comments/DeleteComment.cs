using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Comments;

public static class DeleteComment
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("comments/{id}", Handler)
                .WithTags("Comments")
                .WithSummary("Delete a comment")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string id,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            Result result = await HandleAsync(id, db, userContext, auditService, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Type switch
                {
                    ErrorType.NotFound => Results.NotFound(),
                    _ => failure.Error.Code == "Comment.NotOwner" 
                        ? Results.Forbid() 
                        : CustomResults.Problem(result)
                });
        }
    }

    public static async Task<Result> HandleAsync(
        string id,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid commentId))
            {
                return Result.Failure(
                    Error.Validation("Comment.InvalidId", "Invalid comment ID format"));
            }

            Comment? comment = await db.Comments
                .FirstOrDefaultAsync(c => c.Id == commentId, cancellationToken);

            if (comment is null)
            {
                return Result.Failure(
                    Error.NotFound("Comment.NotFound", $"Comment with id {id} not found"));
            }

            // Check if user owns the comment
            if (comment.CreatedBy != userContext.UserId)
            {
                return Result.Failure(
                    Error.Validation("Comment.NotOwner", "You can only delete your own comments"));
            }

            db.Comments.Remove(comment);
            await db.SaveChangesAsync(cancellationToken);

            // Log audit entry
            if (Guid.TryParse(userContext.UserId, out Guid userId))
            {
                await auditService.LogAsync(
                    AuditAction.CommentDeleted,
                    userId: userId,
                    entityId: commentId,
                    cancellationToken: cancellationToken);
            }

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("Comments.DeleteFailed", $"Failed to delete comment: {ex.Message}"));
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

