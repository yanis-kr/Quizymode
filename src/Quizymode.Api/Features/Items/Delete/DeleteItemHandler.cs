using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Delete;

internal static class DeleteItemHandler
{
    public static async Task<Result> HandleAsync(
        string id,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid itemGuid))
            {
                return Result.Failure(
                    Error.Validation("Item.InvalidId", "Invalid item ID format"));
            }

            Item? item = await db.Items
                .FirstOrDefaultAsync(i => i.Id == itemGuid, cancellationToken);

            if (item is null)
            {
                return Result.Failure(
                    Error.NotFound("Item.NotFound", $"Item with id {id} not found"));
            }

            db.Items.Remove(item);
            await db.SaveChangesAsync(cancellationToken);

            // Log audit entry
            if (!string.IsNullOrEmpty(userContext.UserId) && Guid.TryParse(userContext.UserId, out Guid userId))
            {
                await auditService.LogAsync(
                    AuditAction.ItemDeleted,
                    userId: userId,
                    entityId: itemGuid,
                    cancellationToken: cancellationToken);
            }

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("Item.DeleteFailed", $"Failed to delete item: {ex.Message}"));
        }
    }
}

