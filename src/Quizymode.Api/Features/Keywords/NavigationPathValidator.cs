using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Keywords;

/// <summary>
/// Validates navigation paths using category + KeywordRelation hierarchy.
/// Rank-1 = relation with ParentKeywordId null; rank-2 = relation with ParentKeywordId = rank-1 keyword ID.
/// </summary>
internal static class NavigationPathValidator
{
    public static async Task<Result> ValidatePathAsync(
        string categoryName,
        List<string>? keywords,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Guid? categoryId = await ResolveCategoryIdAsync(categoryName, db, userContext, cancellationToken);
        if (!categoryId.HasValue)
            return Result.Failure(Error.NotFound("Navigation.CategoryNotFound", $"Category '{categoryName}' not found"));

        if (keywords is null || keywords.Count == 0)
            return Result.Success();

        List<string> normalizedKeywords = keywords
            .Select(k => k.Trim().ToLower())
            .Where(k => !string.IsNullOrEmpty(k))
            .ToList();

        if (normalizedKeywords.Count == 0)
            return Result.Success();

        if (normalizedKeywords.Contains("other"))
        {
            if (normalizedKeywords.Count > 1)
                return Result.Failure(Error.Validation("Navigation.InvalidPath", "The 'other' keyword cannot be combined with other keywords"));
            return Result.Success();
        }

        if (normalizedKeywords.Count == 1)
            return Result.Success();

        if (normalizedKeywords.Count >= 2)
        {
            string rank1Name = normalizedKeywords[0];
            bool isValidRank1 = await IsValidRank1KeywordAsync(categoryId.Value, rank1Name, db, userContext, cancellationToken);
            if (!isValidRank1)
                return Result.Failure(Error.Validation("Navigation.InvalidPath", $"Keyword '{rank1Name}' is not a valid rank-1 navigation keyword for category '{categoryName}'"));

            bool hasRank2UnderRank1 = await CategoryHasRank2UnderAsync(categoryId.Value, rank1Name, db, userContext, cancellationToken);
            if (!hasRank2UnderRank1)
                return Result.Success();
            return Result.Success();
        }

        return Result.Success();
    }

    private static async Task<bool> IsValidRank1KeywordAsync(
        Guid categoryId,
        string keywordName,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string keywordLower = keywordName.ToLower();
        IQueryable<KeywordRelation> query = db.KeywordRelations
            .Include(kr => kr.ChildKeyword)
            .Where(kr => kr.CategoryId == categoryId
                && kr.ParentKeywordId == null
                && kr.ChildKeyword.Name.ToLower() == keywordLower);

        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            query = query.Where(kr => !kr.IsPrivate && !kr.ChildKeyword.IsPrivate);
        else
            query = query.Where(kr => (!kr.IsPrivate || kr.CreatedBy == userContext.UserId) && (!kr.ChildKeyword.IsPrivate || kr.ChildKeyword.CreatedBy == userContext.UserId));

        return await query.AnyAsync(cancellationToken);
    }

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
        IQueryable<KeywordRelation> rank1Query = db.KeywordRelations
            .Include(kr => kr.ChildKeyword)
            .Where(kr => kr.CategoryId == categoryId && kr.ParentKeywordId == null && kr.ChildKeyword.Name.ToLower() == rank1Lower);
        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            rank1Query = rank1Query.Where(kr => !kr.IsPrivate);
        else
            rank1Query = rank1Query.Where(kr => !kr.IsPrivate || kr.CreatedBy == userContext.UserId);
        Guid? rank1KeywordId = await rank1Query.Select(kr => kr.ChildKeywordId).FirstOrDefaultAsync(cancellationToken);
        if (rank1KeywordId == default)
            return false;

        IQueryable<KeywordRelation> query = db.KeywordRelations
            .Include(kr => kr.ChildKeyword)
            .Where(kr => kr.CategoryId == categoryId
                && kr.ParentKeywordId == rank1KeywordId
                && kr.ChildKeyword.Name.ToLower() == rank2Lower);

        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            query = query.Where(kr => !kr.IsPrivate && !kr.ChildKeyword.IsPrivate);
        else
            query = query.Where(kr => (!kr.IsPrivate || kr.CreatedBy == userContext.UserId) && (!kr.ChildKeyword.IsPrivate || kr.ChildKeyword.CreatedBy == userContext.UserId));

        return await query.AnyAsync(cancellationToken);
    }

    private static async Task<bool> CategoryHasRank2UnderAsync(
        Guid categoryId,
        string rank1Name,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string rank1Lower = rank1Name.ToLower();
        IQueryable<KeywordRelation> rank1Query = db.KeywordRelations
            .Include(kr => kr.ChildKeyword)
            .Where(kr => kr.CategoryId == categoryId && kr.ParentKeywordId == null && kr.ChildKeyword.Name.ToLower() == rank1Lower);
        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            rank1Query = rank1Query.Where(kr => !kr.IsPrivate);
        else
            rank1Query = rank1Query.Where(kr => !kr.IsPrivate || kr.CreatedBy == userContext.UserId);
        Guid? rank1KeywordId = await rank1Query.Select(kr => kr.ChildKeywordId).FirstOrDefaultAsync(cancellationToken);
        if (rank1KeywordId == default)
            return false;

        IQueryable<KeywordRelation> query = db.KeywordRelations
            .Include(kr => kr.ChildKeyword)
            .Where(kr => kr.CategoryId == categoryId && kr.ParentKeywordId == rank1KeywordId);

        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            query = query.Where(kr => !kr.IsPrivate && !kr.ChildKeyword.IsPrivate);
        else
            query = query.Where(kr => (!kr.IsPrivate || kr.CreatedBy == userContext.UserId) && (!kr.ChildKeyword.IsPrivate || kr.ChildKeyword.CreatedBy == userContext.UserId));

        return await query.AnyAsync(cancellationToken);
    }

    private static async Task<Guid?> ResolveCategoryIdAsync(
        string categoryName,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Category? globalCategory = await db.Categories
            .FirstOrDefaultAsync(c => !c.IsPrivate && c.Name.ToLower() == categoryName.ToLower(), cancellationToken);
        if (globalCategory is not null)
            return globalCategory.Id;

        if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
        {
            Category? privateCategory = await db.Categories
                .FirstOrDefaultAsync(c => c.IsPrivate && c.CreatedBy == userContext.UserId && c.Name.ToLower() == categoryName.ToLower(), cancellationToken);
            if (privateCategory is not null)
                return privateCategory.Id;
        }

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
