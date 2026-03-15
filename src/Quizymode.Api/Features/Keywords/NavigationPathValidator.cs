using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Keywords;

/// <summary>
/// Validates navigation paths using category + navigation keyword hierarchy.
/// Ensures paths like /category/rank1/rank2 are valid according to the navigation structure.
/// </summary>
internal static class NavigationPathValidator
{
    /// <summary>
    /// Validates a navigation path (category + keywords) against the navigation hierarchy.
    /// Returns Result.Success if valid, Result.Failure with error details if invalid.
    /// </summary>
    public static async Task<Result> ValidatePathAsync(
        string categoryName,
        List<string>? keywords,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        // Resolve category
        Guid? categoryId = await ResolveCategoryIdAsync(categoryName, db, userContext, cancellationToken);
        if (!categoryId.HasValue)
        {
            return Result.Failure(Error.NotFound("Navigation.CategoryNotFound", $"Category '{categoryName}' not found"));
        }

        if (keywords is null || keywords.Count == 0)
        {
            // No keywords - valid (just category)
            return Result.Success();
        }

        // Normalize keywords
        List<string> normalizedKeywords = keywords
            .Select(k => k.Trim().ToLower())
            .Where(k => !string.IsNullOrEmpty(k))
            .ToList();

        if (normalizedKeywords.Count == 0)
        {
            return Result.Success();
        }

        // Check for "other" keyword
        if (normalizedKeywords.Contains("other"))
        {
            if (normalizedKeywords.Count > 1)
            {
                return Result.Failure(Error.Validation("Navigation.InvalidPath", 
                    "The 'other' keyword cannot be combined with other keywords"));
            }
            // "other" is always valid for rank-1
            return Result.Success();
        }

        // Validate keyword hierarchy
        if (normalizedKeywords.Count == 1)
        {
            // Single keyword: allow rank-1 (nav) or any item-level keyword (filter, e.g. /categories/certs/s3)
            // Items API will resolve the keyword and filter; unknown keywords yield empty results.
            return Result.Success();
        }

        // Two or more keywords: first must be rank-1; second can be rank-2 (nav) or item-level filter; rest are filters
        if (normalizedKeywords.Count >= 2)
        {
            string rank1Name = normalizedKeywords[0];

            bool isValidRank1 = await IsValidRank1KeywordAsync(
                categoryId.Value,
                rank1Name,
                db,
                userContext,
                cancellationToken);

            if (!isValidRank1)
            {
                return Result.Failure(Error.Validation("Navigation.InvalidPath",
                    $"Keyword '{rank1Name}' is not a valid rank-1 navigation keyword for category '{categoryName}'"));
            }

            // If this category has no rank-2 keywords under this rank-1, the second keyword is always
            // treated as an item-level filter (e.g. "expressions" under language/english). Allow it.
            bool hasRank2UnderRank1 = await CategoryHasRank2UnderAsync(
                categoryId.Value,
                rank1Name,
                db,
                userContext,
                cancellationToken);

            if (!hasRank2UnderRank1)
            {
                return Result.Success();
            }

            // Category has rank-2 nav keywords; second keyword can be either rank-2 (nav) or item-level filter.
            // Allow both — do not require the second keyword to be a valid rank-2.
            return Result.Success();
        }

        return Result.Success();
    }

    /// <summary>
    /// Checks if a keyword is a valid rank-1 navigation keyword for the category.
    /// </summary>
    private static async Task<bool> IsValidRank1KeywordAsync(
        Guid categoryId,
        string keywordName,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string keywordLower = keywordName.ToLower();
        IQueryable<CategoryKeyword> query = db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId
                && ck.NavigationRank == 1
                && ck.Keyword.Name.ToLower() == keywordLower);

        // Apply visibility filter for keywords
        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
        {
            query = query.Where(ck => !ck.Keyword.IsPrivate);
        }
        else
        {
            query = query.Where(ck => !ck.Keyword.IsPrivate 
                || (ck.Keyword.IsPrivate && ck.Keyword.CreatedBy == userContext.UserId));
        }

        return await query.AnyAsync(cancellationToken);
    }

    /// <summary>
    /// Checks if a keyword is a valid rank-2 navigation keyword under the specified rank-1 parent.
    /// </summary>
    private static async Task<bool> IsValidRank2KeywordAsync(
        Guid categoryId,
        string rank1Name,
        string rank2Name,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string rank1Lower = rank1Name.ToLower();
        string rank2Lower = rank2Name.ToLower();
        IQueryable<CategoryKeyword> query = db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId
                && ck.NavigationRank == 2
                && ck.ParentName != null
                && ck.ParentName.ToLower() == rank1Lower
                && ck.Keyword.Name.ToLower() == rank2Lower);

        // Apply visibility filter for keywords
        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
        {
            query = query.Where(ck => !ck.Keyword.IsPrivate);
        }
        else
        {
            query = query.Where(ck => !ck.Keyword.IsPrivate 
                || (ck.Keyword.IsPrivate && ck.Keyword.CreatedBy == userContext.UserId));
        }

        return await query.AnyAsync(cancellationToken);
    }

    /// <summary>
    /// Returns true if the category has any rank-2 navigation keywords under the given rank-1 parent.
    /// Used to allow the second keyword as item-level filter when the category has no rank-2 (e.g. language/english).
    /// </summary>
    private static async Task<bool> CategoryHasRank2UnderAsync(
        Guid categoryId,
        string rank1Name,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string rank1Lower = rank1Name.ToLower();
        IQueryable<CategoryKeyword> query = db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId
                && ck.NavigationRank == 2
                && ck.ParentName != null
                && ck.ParentName.ToLower() == rank1Lower);

        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
        {
            query = query.Where(ck => !ck.Keyword.IsPrivate);
        }
        else
        {
            query = query.Where(ck => !ck.Keyword.IsPrivate
                || (ck.Keyword.IsPrivate && ck.Keyword.CreatedBy == userContext.UserId));
        }

        return await query.AnyAsync(cancellationToken);
    }

    /// <summary>
    /// Resolves category name to category ID, respecting visibility.
    /// </summary>
    private static async Task<Guid?> ResolveCategoryIdAsync(
        string categoryName,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        // Try global category first
        Category? globalCategory = await db.Categories
            .FirstOrDefaultAsync(c => !c.IsPrivate && c.Name.ToLower() == categoryName.ToLower(), cancellationToken);

        if (globalCategory is not null)
        {
            return globalCategory.Id;
        }

        // Try private category if authenticated
        if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
        {
            Category? privateCategory = await db.Categories
                .FirstOrDefaultAsync(c => c.IsPrivate
                    && c.CreatedBy == userContext.UserId
                    && c.Name.ToLower() == categoryName.ToLower(), cancellationToken);

            if (privateCategory is not null)
            {
                return privateCategory.Id;
            }
        }

        // Fallback: resolve by slug (e.g. URL "certs" -> category "Certs")
        string requestedSlug = CategoryHelper.NameToSlug(categoryName);
        if (string.IsNullOrEmpty(requestedSlug))
            return null;

        List<Category> allForSlug = await db.Categories
            .Where(c => !c.IsPrivate || (userContext.IsAuthenticated && c.CreatedBy == userContext.UserId))
            .ToListAsync(cancellationToken);

        Category? bySlug = allForSlug
            .FirstOrDefault(c => string.Equals(CategoryHelper.NameToSlug(c.Name), requestedSlug, StringComparison.OrdinalIgnoreCase));

        return bySlug?.Id;
    }
}
