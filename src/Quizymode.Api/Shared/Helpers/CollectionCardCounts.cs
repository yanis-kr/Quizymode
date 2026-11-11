using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Per-viewer counts for collection cards (#554, #549 decision 4).
/// <see cref="Counts.ItemCount"/> is the lead total: distinct question ids across direct, nested and topic content, visible to the viewer.
/// <see cref="Counts.MemberCount"/> is the secondary label: visible direct members (questions, accessible child collections, live topic paths).
/// The query count does not depend on the page size: the nested walk runs at most <see cref="CollectionMembers.MaxDepth"/> queries,
/// then one query each for direct questions, live topic paths and the candidate topic questions, whatever the number of cards.
/// Hidden questions (media not yet approved, not the viewer's) and orphan member rows (no item row) are excluded.
/// Visibility rules match <see cref="CollectionScope"/>: a private child hidden from the viewer hides its whole subtree.
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

        string callerId = viewerId ?? string.Empty;
        bool hasCaller = callerId.Length > 0;

        // 1. Visible child links, level by level from the roots (same walk and visibility as CollectionScope.AccessibleCollectionIds).
        Dictionary<Guid, List<Guid>> visibleChildren = new();
        List<Guid> frontier = roots;
        for (int depth = 1; depth <= CollectionMembers.MaxDepth && frontier.Count > 0; depth++)
        {
            List<CollectionCollectionMember> links = await db.CollectionCollectionMembers
                .Where(m => frontier.Contains(m.ParentId))
                .Where(m => db.Collections.Any(c => c.Id == m.ChildId && (c.IsPublic || (hasCaller && c.CreatedBy == callerId))))
                .ToListAsync(cancellationToken);

            foreach (CollectionCollectionMember link in links)
            {
                if (!visibleChildren.TryGetValue(link.ParentId, out List<Guid>? children))
                {
                    children = [];
                    visibleChildren[link.ParentId] = children;
                }
                children.Add(link.ChildId);
            }

            frontier = links.Select(l => l.ChildId).Distinct().ToList();
        }

        // Accessible collections per root: the root plus its visible descendants within the depth limit.
        // The read cap (AC 1.16.7) applies to every card too, so counts match the roster and the detail read: the root, then the rest by id.
        Dictionary<Guid, HashSet<Guid>> reach = roots.ToDictionary(r => r, r => Capped(r, AccessibleFrom(r, visibleChildren)));
        List<Guid> allCollections = reach.Values.SelectMany(s => s).Distinct().ToList();

        // 2. Direct questions of every accessible collection that the viewer may see: public and media-eligible, or the viewer's own (#400).
        // A private question of another user is never counted, even inside a public collection (AC 1.17, Invariant I5).
        List<CollectionItem> directRows = await db.CollectionItems
            .Where(ci => allCollections.Contains(ci.CollectionId))
            .Where(ci => db.Items.Where(ItemVisibility.VisibleTo(viewerId)).Any(i => i.Id == ci.ItemId))
            .ToListAsync(cancellationToken);
        Dictionary<Guid, List<Guid>> directItemsByCollection = directRows
            .GroupBy(ci => ci.CollectionId)
            .ToDictionary(g => g.Key, g => g.Select(ci => ci.ItemId).ToList());

        // 3. Live topic paths held by an accessible collection (path liveness as in CollectionScope.LivePath).
        List<CollectionKeywordMember> topics = await db.CollectionKeywordMembers
            .Where(m => allCollections.Contains(m.ParentId))
            .Where(CollectionScope.LivePath(db))
            .ToListAsync(cancellationToken);

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

        Dictionary<Guid, List<Guid>> topicItemsByCollection = new();
        foreach (CollectionKeywordMember topic in topics)
        {
            List<Guid> matches = topicCandidates
                .Where(i => i.CategoryId == topic.CategoryId
                    && i.NavigationKeywordId1 == topic.Keyword1Id
                    && (topic.Keyword2Id is null || i.NavigationKeywordId2 == topic.Keyword2Id))
                .Select(i => i.Id)
                .ToList();

            if (!topicItemsByCollection.TryGetValue(topic.ParentId, out List<Guid>? list))
            {
                list = [];
                topicItemsByCollection[topic.ParentId] = list;
            }
            list.AddRange(matches);
        }

        // 5. Per card: distinct questions over its accessible collections; members are its own direct rows.
        Dictionary<Guid, Counts> result = new();
        foreach (Guid root in roots.Distinct())
        {
            HashSet<Guid> collections = reach[root];

            int itemCount = collections
                .SelectMany(c => directItemsByCollection.GetValueOrDefault(c) ?? [])
                .Concat(collections.SelectMany(c => topicItemsByCollection.GetValueOrDefault(c) ?? []))
                .Distinct()
                .Count();

            int memberCount = (directItemsByCollection.GetValueOrDefault(root)?.Count ?? 0)
                + (visibleChildren.GetValueOrDefault(root)?.Count ?? 0)
                + topics.Count(t => t.ParentId == root);

            result[root] = new Counts(itemCount, memberCount);
        }

        return result;
    }

    /// <summary>The root first, then the rest by id, at most <see cref="CollectionMembers.MaxReadCollections"/> (same order as CollectionScope).</summary>
    private static HashSet<Guid> Capped(Guid root, HashSet<Guid> accessible) =>
        accessible
            .OrderBy(id => id == root ? 0 : 1)
            .ThenBy(id => id)
            .Take(CollectionMembers.MaxReadCollections)
            .ToHashSet();

    /// <summary>The root and its visible descendants, walked at most <see cref="CollectionMembers.MaxDepth"/> link levels.</summary>
    private static HashSet<Guid> AccessibleFrom(Guid root, Dictionary<Guid, List<Guid>> visibleChildren)
    {
        HashSet<Guid> seen = [root];
        List<Guid> level = [root];
        for (int depth = 1; depth <= CollectionMembers.MaxDepth && level.Count > 0; depth++)
        {
            List<Guid> next = [];
            foreach (Guid parent in level)
            {
                if (!visibleChildren.TryGetValue(parent, out List<Guid>? children))
                {
                    continue;
                }

                foreach (Guid child in children.Where(seen.Add))
                {
                    next.Add(child);
                }
            }

            level = next;
        }

        return seen;
    }
}
