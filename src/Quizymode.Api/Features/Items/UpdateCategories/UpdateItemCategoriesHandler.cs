using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.UpdateCategories;

internal static class UpdateItemCategoriesHandler
{
    public static async Task<Result<UpdateItemCategories.Response>> HandleAsync(
        string id,
        UpdateItemCategories.Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        ICategoryResolver categoryResolver,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid itemId))
            {
                return Result.Failure<UpdateItemCategories.Response>(
                    Error.Validation("Item.InvalidId", "Invalid item ID format"));
            }

            string userId = userContext.UserId ?? throw new InvalidOperationException("User ID is required");

            // Verify item exists
            Item? item = await db.Items
                .FirstOrDefaultAsync(i => i.Id == itemId, cancellationToken);

            if (item is null)
            {
                return Result.Failure<UpdateItemCategories.Response>(
                    Error.NotFound("Item.NotFound", $"Item with id {id} not found"));
            }

            // Resolve category
            Category? category = null;

            if (request.CategoryId.HasValue)
            {
                // Validate ownership if categoryId provided
                category = await db.Categories
                    .FirstOrDefaultAsync(
                        c => c.Id == request.CategoryId.Value,
                        cancellationToken);

                if (category is null)
                {
                    return Result.Failure<UpdateItemCategories.Response>(
                        Error.NotFound("Category.NotFound", $"Category with id {request.CategoryId.Value} not found"));
                }

                // Validate ownership: must be global or private-owned-by-current-user
                if (category.IsPrivate && category.CreatedBy != userId)
                {
                    return Result.Failure<UpdateItemCategories.Response>(
                        Error.Validation("Category.AccessDenied", $"Category {request.CategoryId.Value} is private and does not belong to current user"));
                }
            }
            else if (!string.IsNullOrWhiteSpace(request.CategoryName))
            {
                // Resolve by name via CategoryResolver
                Result<Category> resolveResult = await categoryResolver.ResolveOrCreateAsync(
                    request.CategoryName,
                    request.IsPrivate,
                    userId,
                    userContext.IsAdmin,
                    cancellationToken);

                if (resolveResult.IsFailure)
                {
                    return Result.Failure<UpdateItemCategories.Response>(resolveResult.Error!);
                }

                category = resolveResult.Value!;
            }
            else
            {
                return Result.Failure<UpdateItemCategories.Response>(
                    Error.Validation("CategoryAssignment.Invalid", "Must specify either CategoryId or CategoryName"));
            }

            // Update item's category
            item.CategoryId = category.Id;
            await db.SaveChangesAsync(cancellationToken);

            // Build response
            UpdateItemCategories.CategoryResponse categoryResponse = new(
                category.Id,
                category.Name,
                category.IsPrivate);

            UpdateItemCategories.Response response = new(categoryResponse);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<UpdateItemCategories.Response>(
                Error.Problem("ItemCategories.UpdateFailed", $"Failed to update item categories: {ex.Message}"));
        }
    }
}

