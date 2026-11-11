using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Per-viewer counts for collection cards (#554, #549 decision 4).
/// <see cref="Counts.ItemCount"/> is the lead total: distinct question ids across direct, nested and topic content, visible to the viewer.
/// <see cref="Counts.MemberCount"/> is the secondary label: visible direct members (questions, accessible child collections, live topic paths).
/// The query count does not depend on the page size: the nested walk (<see cref="CollectionScope.ResolveManyAsync"/>) runs at most
/// <see cref="CollectionMembers.MaxDepth"/> queries, then one row count per reached collection, then one query each for direct questions, live topic paths and the
/// candidate topic questions, whatever the number of cards (three more only when a collection holds over 500 rows).
/// Hidden questions (media not yet approved, not the viewer's) and orphan member rows (no item row) are excluded.
/// Visibility, depth, the 50-collection cap and the 500-row budget come from <see cref="CollectionScope"/>, so a card's lead total
/// equals the roster total of the same read: a private child hidden from the viewer hides its whole subtree.
/// </summary>
internal static class CollectionCardCounts
{
    public sealed record Counts(int ItemCount, int MemberCount);

    public static async Task<Dictionary<Guid, Counts>> ForCollectionsAsync(
        ApplicationDbContext db,
        IReadOnlyCollection<Guid> collectionIds,
        string? viewerId,
        CancellationToken cancellationToken)
    {
        List<Guid> roots = collectionIds.Distinct().ToList();
        if (roots.Count == 0)
        {
            return new Dictionary<Guid, Counts>();
        }

        // 1. The accessible collections per root: the shared batched walk (visibility, depth, visited set, row budget and the 50-collection cap).
        CollectionScope.BatchResult resolved = await CollectionScope.ResolveManyAsync(db, roots, viewerId, cancellationToken);
        Dictionary<Guid, CollectionScope.Resolution> reach = resolved.Roots;
        List<Guid> allCollections = reach.Values.SelectMany(r => r.Collections).Distinct().ToList();

        // 2. Direct questions of every accessible collection that the viewer may see: public and media-eligible, or the viewer's own (#400).
        // A private question of another user is never counted, even inside a public collection (AC 1.17, Invariant I5).
        List<DirectRow> directRows = await db.CollectionItems
            .Where(ci => allCollections.Contains(ci.CollectionId))
            .Where(ci => db.Items.Where(ItemVisibility.VisibleTo(viewerId)).Any(i => i.Id == ci.ItemId))
            .Select(ci => new DirectRow(ci.Id, ci.CollectionId, ci.ItemId))
            .ToListAsync(cancellationToken);
        Dictionary<Guid, List<DirectRow>> directByCollection = directRows
            .GroupBy(r => r.CollectionId)
            .ToDictionary(g => g.Key, g => g.ToList());

        // 3. Live topic paths held by an accessible collection (path liveness as in CollectionScope.LivePath), minus rows past the budget.
        List<CollectionKeywordMember> liveTopics = await db.CollectionKeywordMembers
            .Where(m => allCollections.Contains(m.ParentId))
            .Where(CollectionScope.LivePath(db))
            .ToListAsync(cancellationToken);
        List<CollectionKeywordMember> topics = liveTopics.Where(t => !resolved.Budget.IsNonItemRowDropped(t.Id)).ToList();

        // 4. Candidate topic questions: visible to the viewer, on any live path, then matched to each path in memory.
        List<Guid> categoryIds = topics.Select(t => t.CategoryId).Distinct().ToList();
        List<Guid> keyword1Ids = topics.Select(t => t.Keyword1Id).Distinct().ToList();
        List<Item> topicCandidates = topics.Count == 0
            ? []
            : await db.Items
                .Where(ItemVisibility.VisibleTo(viewerId))
                .Where(i => i.CategoryId != null && categoryIds.Contains(i.CategoryId.Value))
                .Where(i => i.NavigationKeywordId1 != null && keyword1Ids.Contains(i.NavigationKeywordId1.Value))
                .ToListAsync(cancellationToken);

        Dictionary<Guid, List<Guid>> matchesByTopic = topics.ToDictionary(
            t => t.Id,
            t => topicCandidates
                .Where(i => i.CategoryId == t.CategoryId
                    && i.NavigationKeywordId1 == t.Keyword1Id
                    && (t.Keyword2Id is null || i.NavigationKeywordId2 == t.Keyword2Id))
                .Select(i => i.Id)
                .ToList());

        // 5. Per card: distinct questions over its accessible collections; members are its own direct rows.
        // A nested collection's item rows past its budget do not count (the root's own items always do).
        Dictionary<Guid, Counts> result = new();
        foreach (Guid root in roots.Distinct())
        {
            CollectionScope.Resolution resolution = reach[root];
            HashSet<Guid> collections = resolution.Collections;

            List<Guid> keptDirect = collections
                .SelectMany(c => directByCollection.GetValueOrDefault(c) ?? [])
                .Where(r => !resolved.Budget.IsItemRowDropped(root, r.CollectionId, r.RowId))
                .Select(r => r.ItemId)
                .ToList();
            List<CollectionKeywordMember> cardTopics = topics.Where(t => collections.Contains(t.ParentId)).ToList();

            int itemCount = keptDirect
                .Concat(cardTopics.SelectMany(t => matchesByTopic[t.Id]))
                .Distinct()
                .Count();

            int memberCount = (directByCollection.GetValueOrDefault(root)?.Count ?? 0)
                + resolution.ChildLinkCount
                + cardTopics.Count(t => t.ParentId == root);

            result[root] = new Counts(itemCount, memberCount);
        }

        return result;
    }

    private sealed record DirectRow(Guid RowId, Guid CollectionId, Guid ItemId);
}
