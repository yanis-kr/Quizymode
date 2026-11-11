using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Seed links for repo-managed collections (#556): nested collections (<c>collectionIds</c>) and topic paths
/// (<c>keywordPaths</c>, given by name). Paths are resolved to ids at seed time, so each database keeps its own ids
/// (option A, #553). A repo-managed collection may contain only other repo-managed collections (#556).
/// Reconciling is a diff: a second run with the same file adds and removes nothing.
/// </summary>
internal static class CollectionSeedLinks
{
    /// <summary>A topic path in a seed file: category name, keyword 1 name and an optional keyword 2 name.</summary>
    public sealed record KeywordPathName(string Category, string Keyword1, string? Keyword2);

    /// <summary>A topic path resolved to ids. Only public paths resolve.</summary>
    public sealed record ResolvedTopic(Guid CategoryId, Guid Keyword1Id, Guid? Keyword2Id);

    /// <summary>
    /// Resolves names to public taxonomy ids. Returns one error message per path that does not resolve,
    /// so a bad file names every problem at once.
    /// </summary>
    public static async Task<(List<ResolvedTopic> Topics, List<string> Errors)> ResolveTopicsAsync(
        ApplicationDbContext db,
        IEnumerable<KeywordPathName> paths,
        CancellationToken cancellationToken)
    {
        List<ResolvedTopic> topics = [];
        List<string> errors = [];

        foreach (KeywordPathName path in paths)
        {
            string label = string.Join(" / ", new[] { path.Category, path.Keyword1, path.Keyword2 }.Where(s => !string.IsNullOrWhiteSpace(s)));

            // Names match ignoring case, as the taxonomy seed does.
            string categoryKey = path.Category.ToLower();
            string keyword1Key = path.Keyword1.ToLower();
            string? keyword2Key = path.Keyword2?.ToLower();

            Guid? categoryId = await db.Categories
                .Where(c => c.Name.ToLower() == categoryKey && !c.IsPrivate)
                .Select(c => (Guid?)c.Id)
                .FirstOrDefaultAsync(cancellationToken);
            if (categoryId is null)
            {
                errors.Add($"keyword path '{label}': public category '{path.Category}' not found");
                continue;
            }

            Guid? keyword1Id = await db.Keywords
                .Where(k => k.Name.ToLower() == keyword1Key)
                .Select(k => (Guid?)k.Id)
                .FirstOrDefaultAsync(cancellationToken);
            bool level1 = keyword1Id is not null && await db.KeywordRelations.AnyAsync(r =>
                r.CategoryId == categoryId.Value && r.ParentKeywordId == null && r.ChildKeywordId == keyword1Id.Value,
                cancellationToken);
            if (!level1)
            {
                errors.Add($"keyword path '{label}': keyword '{path.Keyword1}' is not a top-level keyword of '{path.Category}'");
                continue;
            }

            Guid? keyword2Id = null;
            if (!string.IsNullOrWhiteSpace(path.Keyword2))
            {
                keyword2Id = await db.Keywords
                    .Where(k => k.Name.ToLower() == keyword2Key)
                    .Select(k => (Guid?)k.Id)
                    .FirstOrDefaultAsync(cancellationToken);
                bool level2 = keyword2Id is not null && await db.KeywordRelations.AnyAsync(r =>
                    r.CategoryId == categoryId.Value && r.ParentKeywordId == keyword1Id!.Value && r.ChildKeywordId == keyword2Id.Value,
                    cancellationToken);
                if (!level2)
                {
                    errors.Add($"keyword path '{label}': keyword '{path.Keyword2}' is not under '{path.Keyword1}'");
                    continue;
                }
            }

            topics.Add(new ResolvedTopic(categoryId.Value, keyword1Id!.Value, keyword2Id));
        }

        return (topics.Distinct().ToList(), errors);
    }

    /// <summary>
    /// Child collections a repo-managed collection may link to: each must exist (in the database or the same payload)
    /// and be repo-managed. Returns one error message per problem.
    /// </summary>
    public static async Task<List<string>> ValidateChildCollectionsAsync(
        ApplicationDbContext db,
        IEnumerable<Guid> childIds,
        IEnumerable<Guid> payloadRepoManagedIds,
        CancellationToken cancellationToken)
    {
        List<Guid> wanted = childIds.Distinct().ToList();
        if (wanted.Count == 0)
        {
            return [];
        }

        HashSet<Guid> payload = payloadRepoManagedIds.ToHashSet();
        List<Guid> needDb = wanted.Where(id => !payload.Contains(id)).ToList();
        Dictionary<Guid, bool> found = needDb.Count == 0
            ? []
            : (await db.Collections
                .Where(c => needDb.Contains(c.Id))
                .Select(c => new { c.Id, c.IsRepoManaged })
                .ToListAsync(cancellationToken))
                .ToDictionary(c => c.Id, c => c.IsRepoManaged);

        List<string> errors = [];
        foreach (Guid id in wanted)
        {
            if (payload.Contains(id))
            {
                continue;
            }

            if (!found.TryGetValue(id, out bool repoManaged))
            {
                errors.Add($"child collection '{id}' not found");
            }
            else if (!repoManaged)
            {
                errors.Add($"repo-managed collection cannot contain user collection '{id}'");
            }
        }

        return errors;
    }

    /// <summary>Makes the child links of <paramref name="parentId"/> equal <paramref name="desiredChildIds"/>.</summary>
    public static void ReconcileChildLinks(ApplicationDbContext db, Guid parentId, IEnumerable<Guid> desiredChildIds, DateTime utcNow)
    {
        HashSet<Guid> desired = desiredChildIds.ToHashSet();
        List<CollectionCollectionMember> existing = db.CollectionCollectionMembers.Where(m => m.ParentId == parentId).ToList();

        List<CollectionCollectionMember> stale = existing.Where(m => !desired.Contains(m.ChildId)).ToList();
        if (stale.Count > 0)
        {
            db.CollectionCollectionMembers.RemoveRange(stale);
        }

        HashSet<Guid> present = existing.Select(m => m.ChildId).ToHashSet();
        foreach (Guid childId in desired.Where(id => !present.Contains(id)))
        {
            db.CollectionCollectionMembers.Add(new CollectionCollectionMember
            {
                Id = Guid.NewGuid(),
                ParentId = parentId,
                ChildId = childId,
                AddedAt = utcNow
            });
        }
    }

    /// <summary>Makes the topic members of <paramref name="parentId"/> equal <paramref name="desired"/>.</summary>
    public static void ReconcileTopicLinks(ApplicationDbContext db, Guid parentId, IEnumerable<ResolvedTopic> desired, DateTime utcNow)
    {
        HashSet<ResolvedTopic> wanted = desired.ToHashSet();
        List<CollectionKeywordMember> existing = db.CollectionKeywordMembers.Where(m => m.ParentId == parentId).ToList();

        List<CollectionKeywordMember> stale = existing
            .Where(m => !wanted.Contains(new ResolvedTopic(m.CategoryId, m.Keyword1Id, m.Keyword2Id)))
            .ToList();
        if (stale.Count > 0)
        {
            db.CollectionKeywordMembers.RemoveRange(stale);
        }

        HashSet<ResolvedTopic> present = existing
            .Select(m => new ResolvedTopic(m.CategoryId, m.Keyword1Id, m.Keyword2Id))
            .ToHashSet();
        foreach (ResolvedTopic topic in wanted.Where(t => !present.Contains(t)))
        {
            db.CollectionKeywordMembers.Add(new CollectionKeywordMember
            {
                Id = Guid.NewGuid(),
                ParentId = parentId,
                CategoryId = topic.CategoryId,
                Keyword1Id = topic.Keyword1Id,
                Keyword2Id = topic.Keyword2Id,
                AddedAt = utcNow
            });
        }
    }
}
