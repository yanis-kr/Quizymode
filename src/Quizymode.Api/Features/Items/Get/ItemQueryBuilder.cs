using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Get;

/// <summary>
/// Builder class responsible for constructing EF Core queries for items based on filter criteria.
/// Applies filters in a specific order: visibility, category, keywords, collection.
/// Each filter method returns a Result to allow for proper error handling and early termination.
/// </summary>
internal sealed class ItemQueryBuilder
{
    private readonly ApplicationDbContext _db;
    private readonly IUserContext _userContext;
    private readonly CancellationToken _cancellationToken;

    public ItemQueryBuilder(
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        _db = db;
        _userContext = userContext;
        _cancellationToken = cancellationToken;
    }

    /// <summary>
    /// Main method that builds the complete query by applying all requested filters in sequence.
    /// Filters are applied in dependency order: visibility first (fundamental security),
    /// then category, keywords, and finally collection (which depends on visibility).
    /// Returns Result pattern to handle validation errors gracefully.
    /// </summary>
    public async Task<Result<IQueryable<Item>>> BuildQueryAsync(GetItems.QueryRequest request)
    {
        // Validate navigation path if category and keywords are provided
        if (!string.IsNullOrEmpty(request.Category) && request.Keywords is not null && request.Keywords.Count > 0)
        {
            Result pathValidationResult = await Quizymode.Api.Features.Keywords.NavigationPathValidator.ValidatePathAsync(
                request.Category,
                request.Keywords,
                _db,
                _userContext,
                _cancellationToken);

            if (pathValidationResult.IsFailure)
            {
                return Result.Failure<IQueryable<Item>>(pathValidationResult.Error!);
            }
        }

        IQueryable<Item> query = _db.Items.AsQueryable();

        Result<IQueryable<Item>> visibilityResult = ApplyVisibilityFilter(query, request);
        if (visibilityResult.IsFailure)
        {
            return visibilityResult;
        }
        query = visibilityResult.Value;

        Result<IQueryable<Item>> categoryResult = await ApplyCategoryFilterAsync(query, request);
        if (categoryResult.IsFailure)
        {
            return categoryResult;
        }
        query = categoryResult.Value;

        Result<IQueryable<Item>> keywordResult = await ApplyKeywordFilterAsync(query, request);
        if (keywordResult.IsFailure)
        {
            return keywordResult;
        }
        query = keywordResult.Value;

        Result<IQueryable<Item>> collectionResult = await ApplyCollectionFilterAsync(query, request);
        if (collectionResult.IsFailure)
        {
            return collectionResult;
        }
        query = collectionResult.Value;

        return Result.Success(query);
    }

    /// <summary>
    /// Applies visibility filtering to the query based on IsPrivate parameter and user authentication status.
    /// Visibility rules:
    /// - If IsPrivate=true: user must be authenticated and only sees their own private items
    /// - If IsPrivate=false: only global (non-private) items are returned
    /// - If IsPrivate=null (all items):
    ///   - Anonymous users: only global items
    ///   - Authenticated users: global items + their own private items
    /// This ensures users can only see items they have permission to view.
    /// </summary>
    private Result<IQueryable<Item>> ApplyVisibilityFilter(IQueryable<Item> query, GetItems.QueryRequest request)
    {
        if (request.IsPrivate.HasValue)
        {
            if (request.IsPrivate.Value)
            {
                if (!_userContext.IsAuthenticated || string.IsNullOrEmpty(_userContext.UserId))
                {
                    return Result.Failure<IQueryable<Item>>(
                        Error.Validation("Items.Unauthorized", "Must be authenticated to view private items"));
                }
                query = query.Where(i => i.IsPrivate && i.CreatedBy == _userContext.UserId);
            }
            else
            {
                query = query.Where(i => !i.IsPrivate);
            }
        }
        else
        {
            if (!_userContext.IsAuthenticated)
            {
                query = query.Where(i => !i.IsPrivate);
            }
            else if (!string.IsNullOrEmpty(_userContext.UserId))
            {
                query = query.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == _userContext.UserId));
            }
        }

        return Result.Success(query);
    }

    /// <summary>
    /// Applies category filtering to the query. Resolves category name to category ID,
    /// supporting both global and private categories (if user is authenticated).
    /// If category is not found, returns empty result set rather than erroring.
    /// </summary>
    private async Task<Result<IQueryable<Item>>> ApplyCategoryFilterAsync(
        IQueryable<Item> query,
        GetItems.QueryRequest request)
    {
        if (string.IsNullOrEmpty(request.Category))
        {
            return Result.Success(query);
        }

        string categoryName = request.Category.Trim();
        Guid? categoryId = await ResolveCategoryIdAsync(categoryName);

        if (categoryId.HasValue)
        {
            query = query.Where(i => i.CategoryId == categoryId.Value);
        }
        else
        {
            query = query.Where(i => false);
        }

        return Result.Success(query);
    }

    /// <summary>
    /// Resolves a category name to its ID, checking both global and user's private categories.
    /// First checks global categories, then if user is authenticated, checks their private categories.
    /// Uses case-insensitive comparison. Handles NotSupportedException for databases that don't support
    /// ToLower() in queries by loading categories into memory and comparing there.
    /// Returns null if category is not found.
    /// </summary>
    private async Task<Guid?> ResolveCategoryIdAsync(string categoryName)
    {
        try
        {
            Category? globalCategory = await _db.Categories
                .FirstOrDefaultAsync(
                    c => !c.IsPrivate && c.Name.ToLower() == categoryName.ToLower(),
                    _cancellationToken);

            if (globalCategory is not null)
            {
                return globalCategory.Id;
            }

            if (_userContext.IsAuthenticated && !string.IsNullOrEmpty(_userContext.UserId))
            {
                Category? privateCategory = await _db.Categories
                    .FirstOrDefaultAsync(
                        c => c.IsPrivate && c.CreatedBy == _userContext.UserId && c.Name.ToLower() == categoryName.ToLower(),
                        _cancellationToken);

                if (privateCategory is not null)
                {
                    return privateCategory.Id;
                }
            }
        }
        catch (NotSupportedException)
        {
            List<Category> allCategories = await _db.Categories
                .Where(c => !c.IsPrivate)
                .ToListAsync(_cancellationToken);

            Category? globalCategory = allCategories
                .FirstOrDefault(c => string.Equals(c.Name, categoryName, StringComparison.OrdinalIgnoreCase));

            if (globalCategory is not null)
            {
                return globalCategory.Id;
            }

            if (_userContext.IsAuthenticated && !string.IsNullOrEmpty(_userContext.UserId))
            {
                List<Category> privateCategories = await _db.Categories
                    .Where(c => c.IsPrivate && c.CreatedBy == _userContext.UserId)
                    .ToListAsync(_cancellationToken);

                Category? privateCategory = privateCategories
                    .FirstOrDefault(c => string.Equals(c.Name, categoryName, StringComparison.OrdinalIgnoreCase));

                if (privateCategory is not null)
                {
                    return privateCategory.Id;
                }
            }
        }

        return null;
    }

    /// <summary>
    /// Applies keyword filtering to the query using AND semantics (items must have ALL selected keywords).
    /// Handles the special "other" keyword which returns items with no rank-1 navigation keyword assigned.
    /// First resolves keyword names to IDs, respecting visibility (anonymous users see only global keywords,
    /// authenticated users see global + their own private keywords).
    /// </summary>
    private async Task<Result<IQueryable<Item>>> ApplyKeywordFilterAsync(
        IQueryable<Item> query,
        GetItems.QueryRequest request)
    {
        if (request.Keywords is null || request.Keywords.Count == 0)
        {
            return Result.Success(query);
        }

        // Check if category is specified (required for "other" keyword and navigation context)
        if (string.IsNullOrEmpty(request.Category))
        {
            // Without category, fall back to simple keyword matching (AND semantics)
            return await ApplySimpleKeywordFilterAsync(query, request);
        }

        Guid? categoryId = await ResolveCategoryIdAsync(request.Category.Trim());
        if (!categoryId.HasValue)
        {
            // Category not found, return empty result
            return Result.Success(query.Where(i => false));
        }

        // Check for "other" keyword
        List<string> normalizedKeywords = request.Keywords
            .Select(k => k.Trim().ToLowerInvariant())
            .ToList();

        bool hasOtherKeyword = normalizedKeywords.Contains("other");

        if (hasOtherKeyword && normalizedKeywords.Count > 1)
        {
            // "other" cannot be combined with other keywords
            return Result.Success(query.Where(i => false));
        }

        if (hasOtherKeyword)
        {
            // Special handling for "other": items with no rank-1 navigation keyword
            return await ApplyOtherKeywordFilterAsync(query, categoryId.Value);
        }

        // Regular keyword filtering with AND semantics
        return await ApplyAndKeywordFilterAsync(query, request, categoryId.Value);
    }

    /// <summary>
    /// Applies simple keyword filtering with AND semantics when no category is specified.
    /// </summary>
    private async Task<Result<IQueryable<Item>>> ApplySimpleKeywordFilterAsync(
        IQueryable<Item> query,
        GetItems.QueryRequest request)
    {
        IQueryable<Keyword> keywordQuery = _db.Keywords.AsQueryable();

        if (!_userContext.IsAuthenticated || string.IsNullOrEmpty(_userContext.UserId))
        {
            keywordQuery = keywordQuery.Where(k => !k.IsPrivate);
        }
        else
        {
            keywordQuery = keywordQuery.Where(k => !k.IsPrivate || (k.IsPrivate && k.CreatedBy == _userContext.UserId));
        }

        List<string> normalizedKeywords = request.Keywords!
            .Select(k => k.Trim().ToLowerInvariant())
            .ToList();

        List<Guid> visibleKeywordIds = await keywordQuery
            .Where(k => normalizedKeywords.Contains(k.Name.ToLowerInvariant()))
            .Select(k => k.Id)
            .ToListAsync(_cancellationToken);

        if (visibleKeywordIds.Count != normalizedKeywords.Count)
        {
            // Not all keywords found, return empty result
            return Result.Success(query.Where(i => false));
        }

        // AND semantics: item must have ALL keywords
        foreach (Guid keywordId in visibleKeywordIds)
        {
            query = query.Where(i => i.ItemKeywords.Any(ik => ik.KeywordId == keywordId));
        }

        return Result.Success(query);
    }

    /// <summary>
    /// Applies keyword filtering with AND semantics, respecting category context.
    /// </summary>
    private async Task<Result<IQueryable<Item>>> ApplyAndKeywordFilterAsync(
        IQueryable<Item> query,
        GetItems.QueryRequest request,
        Guid categoryId)
    {
        IQueryable<Keyword> keywordQuery = _db.Keywords.AsQueryable();

        if (!_userContext.IsAuthenticated || string.IsNullOrEmpty(_userContext.UserId))
        {
            keywordQuery = keywordQuery.Where(k => !k.IsPrivate);
        }
        else
        {
            keywordQuery = keywordQuery.Where(k => !k.IsPrivate || (k.IsPrivate && k.CreatedBy == _userContext.UserId));
        }

        List<string> normalizedKeywords = request.Keywords!
            .Select(k => k.Trim().ToLowerInvariant())
            .ToList();

        List<Guid> visibleKeywordIds = await keywordQuery
            .Where(k => normalizedKeywords.Contains(k.Name.ToLowerInvariant()))
            .Select(k => k.Id)
            .ToListAsync(_cancellationToken);

        if (visibleKeywordIds.Count != normalizedKeywords.Count)
        {
            // Not all keywords found, return empty result
            return Result.Success(query.Where(i => false));
        }

        // AND semantics: item must have ALL keywords
        foreach (Guid keywordId in visibleKeywordIds)
        {
            query = query.Where(i => i.ItemKeywords.Any(ik => ik.KeywordId == keywordId));
        }

        return Result.Success(query);
    }

    /// <summary>
    /// Applies the special "other" keyword filter: items with no rank-1 navigation keyword assigned.
    /// </summary>
    private async Task<Result<IQueryable<Item>>> ApplyOtherKeywordFilterAsync(
        IQueryable<Item> query,
        Guid categoryId)
    {
        // Get all rank-1 keywords for this category
        List<Guid> rank1KeywordIds = await _db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId && ck.NavigationRank == 1)
            .Select(ck => ck.KeywordId)
            .ToListAsync(_cancellationToken);

        // Items that have no rank-1 keyword assigned
        if (rank1KeywordIds.Count > 0)
        {
            query = query.Where(i => !i.ItemKeywords.Any(ik => rank1KeywordIds.Contains(ik.KeywordId)));
        }
        // If no rank-1 keywords exist, all items in category match "other"

        return Result.Success(query);
    }

    /// <summary>
    /// Applies collection filtering to the query. Requires authentication and verifies
    /// that the user owns the collection (or is admin) before filtering items.
    /// Returns validation error if collection doesn't exist or user doesn't have access.
    /// Loads all item IDs in the collection first, then filters the main query to those IDs.
    /// This approach ensures visibility rules (already applied) are respected.
    /// </summary>
    private async Task<Result<IQueryable<Item>>> ApplyCollectionFilterAsync(
        IQueryable<Item> query,
        GetItems.QueryRequest request)
    {
        if (!request.CollectionId.HasValue)
        {
            return Result.Success(query);
        }

        Collection? collection = await _db.Collections
            .FirstOrDefaultAsync(c => c.Id == request.CollectionId.Value, _cancellationToken);

        if (collection is null)
        {
            return Result.Failure<IQueryable<Item>>(
                Error.NotFound("Collection.NotFound", "Collection not found"));
        }

        string? subject = _userContext.UserId;
        if (string.IsNullOrEmpty(subject))
        {
            return Result.Failure<IQueryable<Item>>(
                Error.Validation("Items.Unauthorized", "Must be authenticated to view collection items"));
        }

        if (collection.CreatedBy != subject && !_userContext.IsAdmin)
        {
            return Result.Failure<IQueryable<Item>>(
                Error.Validation("Collection.AccessDenied", "Access denied"));
        }

        List<Guid> itemIdsInCollection = await _db.CollectionItems
            .Where(ci => ci.CollectionId == request.CollectionId.Value)
            .Select(ci => ci.ItemId)
            .ToListAsync(_cancellationToken);

        if (itemIdsInCollection.Count == 0)
        {
            // No items in collection, return empty result
            query = query.Where(i => false);
            return Result.Success(query);
        }

        // Filter to items in the collection
        // Note: Visibility filter is already applied before this, so only visible items will be included
        query = query.Where(i => itemIdsInCollection.Contains(i.Id));

        return Result.Success(query);
    }
}
