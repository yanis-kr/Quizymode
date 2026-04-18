using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

internal sealed class LanguagesTaxonomyNormalizationService(
    ApplicationDbContext db,
    ILogger<LanguagesTaxonomyNormalizationService> logger)
{
    private const string LanguagesCategoryName = "languages";
    private const string EnglishKeyword = "english";
    private const string OtherLangsKeyword = "other-langs";
    private const string MixedKeyword = "mixed";
    private const string CoreKeyword = "core";
    private const string GrammarKeyword = "grammar";
    private const string VocabKeyword = "vocab";
    private const string IdiomsKeyword = "idioms";
    private const string TravelKeyword = "travel";
    private const string ReadingKeyword = "reading";
    private const string ListeningKeyword = "listening";
    private const string ConversationKeyword = "conversation";

    private static readonly HashSet<string> LegacyRank1Keywords =
    [
        "general",
        "esl",
        GrammarKeyword,
        VocabKeyword,
        IdiomsKeyword,
        TravelKeyword,
        MixedKeyword
    ];

    private static readonly HashSet<string> PromotedLanguageKeywords =
    [
        "english",
        "spanish",
        "french",
        "german",
        "italian",
        "russian",
        "japanese",
        "latvian",
        "ukrainian",
        "bulgarian",
        "romanian",
        "latin"
    ];

    public async Task NormalizeAsync(CancellationToken cancellationToken)
    {
        Category? languagesCategory = await db.Categories
            .AsNoTracking()
            .FirstOrDefaultAsync(
                category => !category.IsPrivate && category.Name.ToLower() == LanguagesCategoryName,
                cancellationToken);

        if (languagesCategory is null)
        {
            return;
        }

        Dictionary<string, Keyword> publicKeywordMap = (await db.Keywords
            .Where(keyword => !keyword.IsPrivate)
            .ToListAsync(cancellationToken))
            .GroupBy(keyword => keyword.Name.ToLower(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        List<Item> languageItems = await db.Items
            .Where(item => item.CategoryId == languagesCategory.Id)
            .Include(item => item.NavigationKeyword1)
            .Include(item => item.NavigationKeyword2)
            .Include(item => item.ItemKeywords)
            .ToListAsync(cancellationToken);

        int migratedItems = 0;
        foreach (Item item in languageItems)
        {
            if (item.NavigationKeyword1 is null || item.NavigationKeyword2 is null)
            {
                continue;
            }

            string currentRank1 = item.NavigationKeyword1.Name.ToLowerInvariant();
            string currentRank2 = item.NavigationKeyword2.Name.ToLowerInvariant();

            if (!TryMapLegacyNavigation(currentRank1, currentRank2, out string targetRank1, out string targetRank2))
            {
                continue;
            }

            if (!publicKeywordMap.TryGetValue(targetRank1, out Keyword? targetRank1Keyword) ||
                !publicKeywordMap.TryGetValue(targetRank2, out Keyword? targetRank2Keyword))
            {
                throw new InvalidOperationException(
                    $"Languages normalization requires public keywords '{targetRank1}' and '{targetRank2}' to exist.");
            }

            Guid originalRank1Id = item.NavigationKeywordId1 ?? Guid.Empty;
            Guid originalRank2Id = item.NavigationKeywordId2 ?? Guid.Empty;

            item.NavigationKeywordId1 = targetRank1Keyword.Id;
            item.NavigationKeywordId2 = targetRank2Keyword.Id;
            item.NavigationKeyword1 = targetRank1Keyword;
            item.NavigationKeyword2 = targetRank2Keyword;

            ReconcileNavigationKeywordLinks(
                item,
                originalRank1Id,
                originalRank2Id,
                targetRank1Keyword.Id,
                targetRank2Keyword.Id);

            migratedItems++;
        }

        List<KeywordRelation> relations = await db.KeywordRelations
            .Where(relation => relation.CategoryId == languagesCategory.Id && !relation.IsPrivate)
            .Include(relation => relation.ParentKeyword)
            .Include(relation => relation.ChildKeyword)
            .ToListAsync(cancellationToken);

        List<KeywordRelation> relationsToRemove = relations
            .Where(IsLegacyLanguagesRelation)
            .ToList();

        if (relationsToRemove.Count > 0)
        {
            db.KeywordRelations.RemoveRange(relationsToRemove);
        }

        if (migratedItems == 0 && relationsToRemove.Count == 0)
        {
            return;
        }

        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Normalized {MigratedItems} legacy language items and removed {RemovedRelations} obsolete language navigation relations.",
            migratedItems,
            relationsToRemove.Count);
    }

    private static bool TryMapLegacyNavigation(
        string currentRank1,
        string currentRank2,
        out string targetRank1,
        out string targetRank2)
    {
        targetRank1 = currentRank1;
        targetRank2 = currentRank2;

        switch (currentRank1)
        {
            case "esl":
                targetRank1 = EnglishKeyword;
                targetRank2 = currentRank2 switch
                {
                    "beginner" => CoreKeyword,
                    "speaking" => ConversationKeyword,
                    ListeningKeyword => ListeningKeyword,
                    GrammarKeyword => GrammarKeyword,
                    VocabKeyword => VocabKeyword,
                    ReadingKeyword => ReadingKeyword,
                    _ => CoreKeyword
                };
                return true;
            case GrammarKeyword:
                targetRank1 = EnglishKeyword;
                targetRank2 = GrammarKeyword;
                return true;
            case VocabKeyword:
                targetRank1 = EnglishKeyword;
                targetRank2 = VocabKeyword;
                return true;
            case IdiomsKeyword:
                targetRank1 = EnglishKeyword;
                targetRank2 = IdiomsKeyword;
                return true;
            case TravelKeyword:
                targetRank1 = EnglishKeyword;
                targetRank2 = TravelKeyword;
                return true;
            case "general":
            case MixedKeyword:
                targetRank1 = OtherLangsKeyword;
                targetRank2 = MixedKeyword;
                return true;
            case OtherLangsKeyword when PromotedLanguageKeywords.Contains(currentRank2):
                targetRank1 = currentRank2;
                targetRank2 = CoreKeyword;
                return true;
            default:
                return false;
        }
    }

    private void ReconcileNavigationKeywordLinks(
        Item item,
        Guid originalRank1Id,
        Guid originalRank2Id,
        Guid targetRank1Id,
        Guid targetRank2Id)
    {
        item.ItemKeywords ??= [];

        HashSet<Guid> targetKeywordIds =
        [
            targetRank1Id,
            targetRank2Id
        ];

        HashSet<Guid> legacyKeywordIds = [];
        if (originalRank1Id != Guid.Empty && !targetKeywordIds.Contains(originalRank1Id))
        {
            legacyKeywordIds.Add(originalRank1Id);
        }

        if (originalRank2Id != Guid.Empty && !targetKeywordIds.Contains(originalRank2Id))
        {
            legacyKeywordIds.Add(originalRank2Id);
        }

        List<ItemKeyword> linksToRemove = item.ItemKeywords
            .Where(link => legacyKeywordIds.Contains(link.KeywordId))
            .ToList();

        if (linksToRemove.Count > 0)
        {
            db.ItemKeywords.RemoveRange(linksToRemove);
            foreach (ItemKeyword link in linksToRemove)
            {
                item.ItemKeywords.Remove(link);
            }
        }

        HashSet<Guid> existingKeywordIds = item.ItemKeywords
            .Select(link => link.KeywordId)
            .ToHashSet();

        foreach (Guid keywordId in targetKeywordIds)
        {
            if (existingKeywordIds.Contains(keywordId))
            {
                continue;
            }

            ItemKeyword link = new()
            {
                Id = Guid.NewGuid(),
                ItemId = item.Id,
                KeywordId = keywordId,
                AddedAt = DateTime.UtcNow
            };

            db.ItemKeywords.Add(link);
            item.ItemKeywords.Add(link);
        }
    }

    private static bool IsLegacyLanguagesRelation(KeywordRelation relation)
    {
        string childName = relation.ChildKeyword.Name.ToLowerInvariant();

        if (relation.ParentKeywordId is null)
        {
            return LegacyRank1Keywords.Contains(childName);
        }

        string? parentName = relation.ParentKeyword?.Name.ToLowerInvariant();
        if (parentName is null)
        {
            return false;
        }

        if (LegacyRank1Keywords.Contains(parentName))
        {
            return true;
        }

        return parentName == OtherLangsKeyword && PromotedLanguageKeywords.Contains(childName);
    }
}
