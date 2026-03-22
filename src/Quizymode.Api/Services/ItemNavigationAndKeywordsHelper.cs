using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

internal static class ItemNavigationAndKeywordsHelper
{
    public static async Task<Result<(Keyword Nav1, Keyword Nav2)>> ResolvePublicNavigationAsync(
        ApplicationDbContext db,
        ITaxonomyRegistry taxonomy,
        Category category,
        string navigationKeyword1,
        string navigationKeyword2,
        CancellationToken cancellationToken)
    {
        string n1 = KeywordHelper.NormalizeKeywordName(navigationKeyword1);
        string n2 = KeywordHelper.NormalizeKeywordName(navigationKeyword2);
        if (string.IsNullOrEmpty(n1) || string.IsNullOrEmpty(n2))
        {
            return Result.Failure<(Keyword, Keyword)>(
                Error.Validation("Item.InvalidNavigation", "Navigation keywords are required."));
        }

        if (!taxonomy.IsValidNavigationPath(category.Name, n1, n2))
        {
            return Result.Failure<(Keyword, Keyword)>(
                Error.Validation(
                    "Item.InvalidNavigationPath",
                    $"'{n1}' / '{n2}' is not a valid navigation path for category '{category.Name}'."));
        }

        KeywordRelation? rel1 = await db.KeywordRelations
            .Include(kr => kr.ChildKeyword)
            .FirstOrDefaultAsync(
                kr =>
                    kr.CategoryId == category.Id &&
                    kr.ParentKeywordId == null &&
                    !kr.IsPrivate &&
                    kr.ChildKeyword.Name.ToLower() == n1,
                cancellationToken);

        if (rel1 is null)
        {
            return Result.Failure<(Keyword, Keyword)>(
                Error.Validation(
                    "Item.InvalidNavigationKeyword1",
                    $"'{navigationKeyword1}' is not a valid primary topic for category '{category.Name}'."));
        }

        KeywordRelation? rel2 = await db.KeywordRelations
            .Include(kr => kr.ChildKeyword)
            .FirstOrDefaultAsync(
                kr =>
                    kr.CategoryId == category.Id &&
                    kr.ParentKeywordId == rel1.ChildKeywordId &&
                    !kr.IsPrivate &&
                    kr.ChildKeyword.Name.ToLower() == n2,
                cancellationToken);

        if (rel2 is null)
        {
            return Result.Failure<(Keyword, Keyword)>(
                Error.Validation(
                    "Item.InvalidNavigationKeyword2",
                    $"'{navigationKeyword2}' is not a valid subtopic under '{navigationKeyword1}' for category '{category.Name}'."));
        }

        return Result.Success((rel1.ChildKeyword, rel2.ChildKeyword));
    }

    /// <summary>Extras that are taxonomy slugs use the global keyword; otherwise a private pending keyword for the user.</summary>
    public static async Task<Keyword> GetOrCreateKeywordForItemAttachmentAsync(
        ApplicationDbContext db,
        ITaxonomyRegistry taxonomy,
        string categoryName,
        string userId,
        string normalizedName,
        CancellationToken cancellationToken)
    {
        bool isPublicTaxonomy = taxonomy.IsTaxonomyKeywordInCategory(categoryName, normalizedName);
        if (isPublicTaxonomy)
        {
            Keyword? global = await db.Keywords.FirstOrDefaultAsync(
                k => !k.IsPrivate && k.Name.ToLower() == normalizedName,
                cancellationToken);
            if (global is not null)
                return global;

            string slug = KeywordHelper.NameToSlug(normalizedName);
            if (string.IsNullOrEmpty(slug))
                slug = normalizedName;
            global = new Keyword
            {
                Id = Guid.NewGuid(),
                Name = normalizedName,
                Slug = slug,
                IsPrivate = false,
                CreatedBy = userId,
                CreatedAt = DateTime.UtcNow,
                IsReviewPending = false
            };
            db.Keywords.Add(global);
            await db.SaveChangesAsync(cancellationToken);
            return global;
        }

        Keyword? priv = await db.Keywords.FirstOrDefaultAsync(
            k => k.IsPrivate && k.CreatedBy == userId && k.Name.ToLower() == normalizedName,
            cancellationToken);
        if (priv is not null)
            return priv;

        string privSlug = KeywordHelper.NameToSlug(normalizedName);
        if (string.IsNullOrEmpty(privSlug))
            privSlug = normalizedName;
        priv = new Keyword
        {
            Id = Guid.NewGuid(),
            Name = normalizedName,
            Slug = privSlug,
            IsPrivate = true,
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow,
            IsReviewPending = true
        };
        db.Keywords.Add(priv);
        await db.SaveChangesAsync(cancellationToken);
        return priv;
    }
}
