using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Get;

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

    public async Task<Result<IQueryable<Item>>> BuildQueryAsync(GetItems.QueryRequest request)
    {
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

    private async Task<Result<IQueryable<Item>>> ApplyKeywordFilterAsync(
        IQueryable<Item> query,
        GetItems.QueryRequest request)
    {
        if (request.Keywords is null || request.Keywords.Count == 0)
        {
            return Result.Success(query);
        }

        IQueryable<Keyword> keywordQuery = _db.Keywords.AsQueryable();

        if (!_userContext.IsAuthenticated || string.IsNullOrEmpty(_userContext.UserId))
        {
            keywordQuery = keywordQuery.Where(k => !k.IsPrivate);
        }
        else
        {
            keywordQuery = keywordQuery.Where(k => !k.IsPrivate || (k.IsPrivate && k.CreatedBy == _userContext.UserId));
        }

        List<Guid> visibleKeywordIds = await keywordQuery
            .Where(k => request.Keywords.Contains(k.Name))
            .Select(k => k.Id)
            .ToListAsync(_cancellationToken);

        if (visibleKeywordIds.Count > 0)
        {
            query = query.Where(i => i.ItemKeywords.Any(ik => visibleKeywordIds.Contains(ik.KeywordId)));
        }
        else
        {
            query = query.Where(i => false);
        }

        return Result.Success(query);
    }

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
        if (collection.CreatedBy != subject && !_userContext.IsAdmin)
        {
            return Result.Failure<IQueryable<Item>>(
                Error.Validation("Collection.AccessDenied", "Access denied"));
        }

        List<Guid> itemIdsInCollection = await _db.CollectionItems
            .Where(ci => ci.CollectionId == request.CollectionId.Value)
            .Select(ci => ci.ItemId)
            .ToListAsync(_cancellationToken);

        query = query.Where(i => itemIdsInCollection.Contains(i.Id));

        return Result.Success(query);
    }
}
