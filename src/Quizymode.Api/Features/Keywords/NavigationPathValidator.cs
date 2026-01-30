using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
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
            .Select(k => k.Trim().ToLowerInvariant())
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
            // Single keyword - must be rank-1
            string keywordName = normalizedKeywords[0];
            bool isValidRank1 = await IsValidRank1KeywordAsync(
                categoryId.Value,
                keywordName,
                db,
                userContext,
                cancellationToken);

            if (!isValidRank1)
            {
                return Result.Failure(Error.Validation("Navigation.InvalidPath",
                    $"Keyword '{keywordName}' is not a valid rank-1 navigation keyword for category '{categoryName}'"));
            }

            return Result.Success();
        }

        if (normalizedKeywords.Count == 2)
        {
            // Two keywords - first must be rank-1, second must be rank-2 under that parent
            string rank1Name = normalizedKeywords[0];
            string rank2Name = normalizedKeywords[1];

            // Validate rank-1
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

            // Validate rank-2 under rank-1 parent
            bool isValidRank2 = await IsValidRank2KeywordAsync(
                categoryId.Value,
                rank1Name,
                rank2Name,
                db,
                userContext,
                cancellationToken);

            if (!isValidRank2)
            {
                return Result.Failure(Error.Validation("Navigation.InvalidPath",
                    $"Keyword '{rank2Name}' is not a valid rank-2 navigation keyword under '{rank1Name}' in category '{categoryName}'"));
            }

            return Result.Success();
        }

        // More than 2 keywords - invalid (navigation only supports 2 levels)
        return Result.Failure(Error.Validation("Navigation.InvalidPath",
            "Navigation paths can have at most 2 keyword levels (rank-1 and rank-2)"));
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
        IQueryable<CategoryKeyword> query = db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId
                && ck.NavigationRank == 1
                && ck.Keyword.Name.ToLowerInvariant() == keywordName.ToLowerInvariant());

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
        IQueryable<CategoryKeyword> query = db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId
                && ck.NavigationRank == 2
                && ck.ParentName != null
                && ck.ParentName.ToLowerInvariant() == rank1Name.ToLowerInvariant()
                && ck.Keyword.Name.ToLowerInvariant() == rank2Name.ToLowerInvariant());

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

        return null;
    }
}
