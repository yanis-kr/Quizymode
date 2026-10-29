using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Personalization;

public static partial class Personalization
{
    private sealed record InterestTarget(Guid CategoryId, Guid? NavigationKeywordId1 = null, Guid? NavigationKeywordId2 = null);

    private static InterestTarget TargetOf(UserInterest interest) =>
        new(interest.CategoryId, interest.NavigationKeywordId1, interest.NavigationKeywordId2);

    private static bool HasOverlappingTopics(List<string> paths) => paths.Any(path => path is not null &&
        paths.Any(other => other is not null && other.StartsWith(path + "/", StringComparison.Ordinal)));

    private static async Task<Dictionary<string, InterestTarget>> LoadInterestTargetsAsync(
        ApplicationDbContext db, Dictionary<string, Guid> categories, HashSet<Guid> categoryIds, CancellationToken cancellationToken)
    {
        Dictionary<string, InterestTarget> targets = categories.Where(category => categoryIds.Contains(category.Value))
            .ToDictionary(category => category.Key, category => new InterestTarget(category.Value), StringComparer.Ordinal);
        if (targets.Count == 0) return targets;
        Dictionary<Guid, string> slugs = targets.ToDictionary(entry => entry.Value.CategoryId, entry => entry.Key);
        var relations = await db.KeywordRelations.AsNoTracking()
            .Where(relation => categoryIds.Contains(relation.CategoryId) && !relation.IsPrivate && !relation.ChildKeyword.IsPrivate)
            .Select(relation => new { relation.CategoryId, relation.ParentKeywordId, relation.ChildKeywordId, relation.ChildKeyword.Name })
            .ToListAsync(cancellationToken);
        foreach (var root in relations.Where(relation => relation.ParentKeywordId is null))
        {
            if (!slugs.TryGetValue(root.CategoryId, out string? category)) continue;
            string prefix = $"{category}/{root.Name}";
            targets.TryAdd(prefix, new InterestTarget(root.CategoryId, root.ChildKeywordId));
            foreach (var leaf in relations.Where(relation => relation.CategoryId == root.CategoryId && relation.ParentKeywordId == root.ChildKeywordId))
                targets.TryAdd($"{prefix}/{leaf.Name}", new InterestTarget(root.CategoryId, root.ChildKeywordId, leaf.ChildKeywordId));
        }
        return targets;
    }
}
