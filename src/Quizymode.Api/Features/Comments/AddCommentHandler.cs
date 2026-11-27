using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.Comments;

internal static class AddCommentHandler
{
    public static async Task<Result<AddComment.Response>> HandleAsync(
        AddComment.Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken,
        QuotaSettings? quotas = null)
    {
        try
        {
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                return Result.Failure<AddComment.Response>(
                    Error.Validation("Comment.UserIdMissing", "User ID is missing"));
            }

            bool itemExists = await ItemVisibility.InteractableBy(db, userContext).AnyAsync(i => i.Id == request.ItemId, cancellationToken);
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

            // AC 17.4/17.6: count and insert in one transaction, serialised per user. Audit logging stays after the commit.
            await using (IDbContextTransaction? transaction = await CreationQuota.BeginAsync(db, cancellationToken))
            {
                Error? quotaError = await CreationQuota.CheckCommentsAsync(db, userContext, 1, quotas, entity.CreatedAt, cancellationToken);
                if (quotaError is not null)
                {
                    return Result.Failure<AddComment.Response>(quotaError);
                }

                db.Comments.Add(entity);
                await db.SaveChangesAsync(cancellationToken);
                if (transaction is not null)
                {
                    await transaction.CommitAsync(cancellationToken);
                }
            }

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
                Error.Problem("Comments.CreateFailed", "Failed to create comment.", ex));
        }
    }
}
