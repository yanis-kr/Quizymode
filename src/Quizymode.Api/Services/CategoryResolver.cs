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

                // Try to find existing global category (case-insensitive)
                // Use ToLower() for database-agnostic case-insensitive comparison
                Category? existingGlobal = await _db.Categories
                    .FirstOrDefaultAsync(
                        c => !c.IsPrivate &&
                             c.Name.ToLower() == trimmedName.ToLower(),
                        cancellationToken);

                if (existingGlobal is not null)
                {
                    return Result.Success(existingGlobal);
                }

                // Create new global category
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
            // Try to find existing private category for this user (case-insensitive)
            // Use ToLower() for database-agnostic case-insensitive comparison
            Category? existingPrivate = await _db.Categories
                .FirstOrDefaultAsync(
                    c => c.IsPrivate &&
                         c.CreatedBy == currentUserId &&
                         c.Name.ToLower() == trimmedName.ToLower(),
                    cancellationToken);

            if (existingPrivate is not null)
            {
                return Result.Success(existingPrivate);
            }

            // Create new private category for user
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

