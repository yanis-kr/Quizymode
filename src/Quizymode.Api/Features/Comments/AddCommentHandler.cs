using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Comments;

internal static class AddCommentHandler
{
    public static async Task<Result<AddComment.Response>> HandleAsync(
        AddComment.Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                return Result.Failure<AddComment.Response>(
                    Error.Validation("Comment.UserIdMissing", "User ID is missing"));
            }

            bool itemExists = await db.Items.AnyAsync(i => i.Id == request.ItemId, cancellationToken);
            if (!itemExists)
            {
                return Result.Failure<AddComment.Response>(
                    Error.NotFound("Comment.ItemNotFound", $"Item with id {request.ItemId} not found"));
            }

            Comment entity = new()
            {
                Id = Guid.NewGuid(),
                ItemId = request.ItemId,
                Text = request.Text,
                CreatedBy = userContext.UserId,
                CreatedAt = DateTime.UtcNow
            };

            db.Comments.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            if (Guid.TryParse(userContext.UserId, out Guid userId))
            {
                await auditService.LogAsync(
                    AuditAction.CommentCreated,
                    userId: userId,
                    entityId: entity.Id,
                    cancellationToken: cancellationToken);
            }

            string? userName = null;
            if (Guid.TryParse(userContext.UserId, out Guid userIdForName))
            {
                User? user = await db.Users
                    .FirstOrDefaultAsync(u => u.Id == userIdForName, cancellationToken);
                userName = user?.Name;
            }

            AddComment.Response response = new(
                entity.Id.ToString(),
                entity.ItemId,
                entity.Text,
                entity.CreatedBy,
                userName,
                entity.CreatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<AddComment.Response>(
                Error.Problem("Comments.CreateFailed", $"Failed to create comment: {ex.Message}"));
        }
    }
}
