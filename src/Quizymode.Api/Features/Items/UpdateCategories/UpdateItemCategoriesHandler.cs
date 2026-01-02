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

            // Resolve all categories
            List<Category> resolvedCategories = new();
            foreach (UpdateItemCategories.CategoryAssignment assignment in request.Assignments)
            {
                Category? category = null;

                if (assignment.CategoryId.HasValue)
                {
                    // Validate ownership if categoryId provided
                    category = await db.Categories
                        .FirstOrDefaultAsync(
                            c => c.Id == assignment.CategoryId.Value,
                            cancellationToken);

                    if (category is null)
                    {
                        return Result.Failure<UpdateItemCategories.Response>(
                            Error.NotFound("Category.NotFound", $"Category with id {assignment.CategoryId.Value} not found"));
                    }

                    // Validate ownership: must be global or private-owned-by-current-user
                    if (category.IsPrivate && category.CreatedBy != userId)
                    {
                        return Result.Failure<UpdateItemCategories.Response>(
                            Error.Validation("Category.AccessDenied", $"Category {assignment.CategoryId.Value} is private and does not belong to current user"));
                    }

                    // Validate depth matches
                    if (category.Depth != assignment.Depth)
                    {
                        return Result.Failure<UpdateItemCategories.Response>(
                            Error.Validation("Category.DepthMismatch", $"Category {assignment.CategoryId.Value} has depth {category.Depth}, but assignment specifies depth {assignment.Depth}"));
                    }
                }
                else if (!string.IsNullOrWhiteSpace(assignment.Name))
                {
                    // Resolve by name via CategoryResolver
                    Result<Category> resolveResult = await categoryResolver.ResolveOrCreateAsync(
                        assignment.Name,
                        assignment.Depth,
                        assignment.IsPrivate,
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
                        Error.Validation("CategoryAssignment.Invalid", "Each assignment must specify either CategoryId or Name"));
                }

                resolvedCategories.Add(category);
            }

            // Replace semantics: delete all existing CategoryItems for this item
            List<CategoryItem> existingCategoryItems = await db.CategoryItems
                .Where(ci => ci.ItemId == itemId)
                .ToListAsync(cancellationToken);
            db.CategoryItems.RemoveRange(existingCategoryItems);
            await db.SaveChangesAsync(cancellationToken);

            // Create new CategoryItem relationships
            DateTime now = DateTime.UtcNow;
            List<CategoryItem> newCategoryItems = resolvedCategories.Select(category => new CategoryItem
            {
                CategoryId = category.Id,
                ItemId = itemId,
                CreatedBy = userId,
                CreatedAt = now
            }).ToList();

            db.CategoryItems.AddRange(newCategoryItems);
            await db.SaveChangesAsync(cancellationToken);

            // Build response
            List<UpdateItemCategories.CategoryResponse> categoryResponses = resolvedCategories.Select(c => new UpdateItemCategories.CategoryResponse(
                c.Id,
                c.Name,
                c.Depth,
                c.IsPrivate)).ToList();

            UpdateItemCategories.Response response = new(categoryResponses);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<UpdateItemCategories.Response>(
                Error.Problem("ItemCategories.UpdateFailed", $"Failed to update item categories: {ex.Message}"));
        }
    }
}

