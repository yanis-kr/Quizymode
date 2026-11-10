using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Single read path for the items a collection contains (#551, #552).
/// Every method returns a composable query, not a materialized list, so a caller that filters on it runs one SQL statement.
/// Nested members are walked with an unrolled, fixed number of levels (<see cref="CollectionMembers.MaxDepth"/>), so a cycle
/// stored in the data still terminates. The child visibility check runs inside SQL at each level.
/// </summary>
internal static class CollectionScope
{
    /// <summary>Item ids that are direct members of <paramref name="collectionId"/>, as a composable query.</summary>
    public static IQueryable<Guid> DirectMemberItemIds(ApplicationDbContext db, Guid collectionId) =>
        db.CollectionItems
            .Where(ci => ci.CollectionId == collectionId)
            .Select(ci => ci.ItemId);

    /// <summary>
    /// Ids of the collections reachable from <paramref name="rootId"/> through nested links that the viewer may open:
    /// the root itself, plus child collections that are public or owned by <paramref name="viewerId"/>, up to
    /// <see cref="CollectionMembers.MaxDepth"/> levels. A private child hidden from the viewer hides its whole subtree.
    /// </summary>
    public static IQueryable<Guid> AccessibleCollectionIds(ApplicationDbContext db, Guid rootId, string? viewerId)
    {
        string callerId = viewerId ?? string.Empty;
        bool hasCaller = callerId.Length > 0;

        IQueryable<Guid> all = db.Collections.Where(c => c.Id == rootId).Select(c => c.Id);
        IQueryable<Guid> level = all;

        for (int depth = 1; depth <= CollectionMembers.MaxDepth; depth++)
        {
            IQueryable<Guid> frontier = level;
            IQueryable<Guid> next = db.CollectionCollectionMembers
                .Where(m => frontier.Contains(m.ParentId))
                .Where(m => db.Collections.Any(c => c.Id == m.ChildId && (c.IsPublic || (hasCaller && c.CreatedBy == callerId))))
                .Select(m => m.ChildId);

            all = all.Union(next);
            level = next;
        }

        return all;
    }

    /// <summary>
    /// Item ids of every accessible member of <paramref name="rootId"/>: its direct items and the items of accessible nested
    /// collections, as a distinct set.
    /// </summary>
    public static IQueryable<Guid> AccessibleMemberItemIds(ApplicationDbContext db, Guid rootId, string? viewerId)
    {
        IQueryable<Guid> collectionIds = AccessibleCollectionIds(db, rootId, viewerId);

        return db.CollectionItems
            .Where(ci => collectionIds.Contains(ci.CollectionId))
            .Select(ci => ci.ItemId)
            .Distinct();
    }
}
