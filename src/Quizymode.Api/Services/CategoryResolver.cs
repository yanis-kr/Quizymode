using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

public interface ICategoryResolver
{
    Task<Result<Category>> ResolveOrCreateAsync(
        string name,
        bool isPrivate,
        string currentUserId,
        bool isAdmin,
        CancellationToken cancellationToken = default);
}

internal sealed class CategoryResolver(
    ApplicationDbContext db,
    ILogger<CategoryResolver> logger) : ICategoryResolver
{
    private readonly ApplicationDbContext _db = db;
    private readonly ILogger<CategoryResolver> _logger = logger;

    public async Task<Result<Category>> ResolveOrCreateAsync(
        string name,
        bool isPrivate,
        string currentUserId,
        bool isAdmin,
        CancellationToken cancellationToken = default)
    {
        try
        {
            string trimmedName = name.Trim();
            if (string.IsNullOrWhiteSpace(trimmedName))
            {
                return Result.Failure<Category>(
                    Error.Validation("Category.InvalidName", "Category name cannot be empty"));
            }

            // If global category requested
            if (!isPrivate)
            {
                // Only admin can create/use global categories
                if (!isAdmin)
                {
                    return Result.Failure<Category>(
                        Error.Validation("Category.AdminOnly", "Only administrators can create or use global categories"));
                }

                // Check if ANY category with this name already exists (case-insensitive)
                // Since category names are globally unique, we can't create a global category if one already exists
                Category? existingCategory = await _db.Categories
                    .FirstOrDefaultAsync(
                        c => c.Name.ToLower() == trimmedName.ToLower(),
                        cancellationToken);

                if (existingCategory is not null)
                {
                    // Category with this name already exists
                    if (existingCategory.IsPrivate)
                    {
                        return Result.Failure<Category>(
                            Error.Conflict("Category.NameExists", 
                                $"A private category named '{trimmedName}' already exists. Global categories cannot share names with private categories."));
                    }

                    // Global category exists, return it
                    return Result.Success(existingCategory);
                }

                // No category with this name exists, create new global category
                Category newCategory = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = trimmedName, // Preserve original case
                    IsPrivate = false,
                    CreatedBy = currentUserId,
                    CreatedAt = DateTime.UtcNow
                };

                _db.Categories.Add(newCategory);
                await _db.SaveChangesAsync(cancellationToken);

                _logger.LogInformation("Created global category: {Name}", trimmedName);
                return Result.Success(newCategory);
            }

            // Private category requested
            // First check if ANY category with this name already exists (case-insensitive)
            // Since category names are globally unique, we can't create a private category if a global one exists
            Category? existingPrivateCategory = await _db.Categories
                .FirstOrDefaultAsync(
                    c => c.Name.ToLower() == trimmedName.ToLower(),
                    cancellationToken);

            if (existingPrivateCategory is not null)
            {
                // Category with this name already exists
                // If it's a global category, allow using it for private items (both admin and non-admin)
                // This allows users to create private items that reference global categories
                if (!existingPrivateCategory.IsPrivate)
                {
                    // Allow using global category for private items - the item is private but can use a global category
                    return Result.Success(existingPrivateCategory);
                }

                // If it's a private category, check if it belongs to this user
                if (existingPrivateCategory.CreatedBy != currentUserId)
                {
                    return Result.Failure<Category>(
                        Error.Conflict("Category.NameExists", 
                            $"A private category named '{trimmedName}' already exists for another user. Category names must be unique."));
                }

                // Private category exists and belongs to this user
                return Result.Success(existingPrivateCategory);
            }

            // No category with this name exists, create new private category for user
            Category newPrivateCategory = new Category
            {
                Id = Guid.NewGuid(),
                Name = trimmedName, // Preserve original case
                IsPrivate = true,
                CreatedBy = currentUserId,
                CreatedAt = DateTime.UtcNow
            };

            _db.Categories.Add(newPrivateCategory);
            await _db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Created private category: {Name} for user {UserId}", trimmedName, currentUserId);
            return Result.Success(newPrivateCategory);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resolving or creating category: {Name}", name);
            return Result.Failure<Category>(
                Error.Problem("Category.ResolveFailed", $"Failed to resolve or create category: {ex.Message}"));
        }
    }
}

