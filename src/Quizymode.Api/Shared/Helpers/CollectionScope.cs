using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;

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
    /// The accessible collections read by one resolution, capped at <see cref="CollectionMembers.MaxReadCollections"/> (AC 1.16.6).
    /// The cap is applied in SQL (ordered by id, so the same cap is chosen every time), so the caller's query stays one statement.
    /// </summary>
    public static IQueryable<Guid> CappedCollectionIds(ApplicationDbContext db, Guid rootId, string? viewerId) =>
        CapOrder(AccessibleCollectionIds(db, rootId, viewerId), rootId)
            .Take(CollectionMembers.MaxReadCollections);

    /// <summary>The root always comes first, then the rest by id, so the cap never drops the collection being read.</summary>
    private static IOrderedQueryable<Guid> CapOrder(IQueryable<Guid> ids, Guid rootId) =>
        ids.OrderBy(id => id == rootId ? 0 : 1).ThenBy(id => id);

    /// <summary>
    /// True when the resolution from <paramref name="rootId"/> reaches more accessible collections than the read cap, so some
    /// nested content is left out and the response must say so (<c>incomplete</c>, AC 1.16.6).
    /// </summary>
    public static Task<bool> IsIncompleteAsync(ApplicationDbContext db, Guid rootId, string? viewerId, CancellationToken cancellationToken) =>
        CapOrder(AccessibleCollectionIds(db, rootId, viewerId), rootId)
            .Skip(CollectionMembers.MaxReadCollections)
            .AnyAsync(cancellationToken);

    /// <summary>
    /// Item ids of every accessible member of <paramref name="rootId"/>: its direct items and the items of accessible nested
    /// collections, as a distinct set. Nested collections beyond the read cap are not included.
    /// </summary>
    public static IQueryable<Guid> AccessibleMemberItemIds(ApplicationDbContext db, Guid rootId, string? viewerId)
    {
        IQueryable<Guid> collectionIds = CappedCollectionIds(db, rootId, viewerId);

        IQueryable<Guid> directAndNested = db.CollectionItems
            .Where(ci => collectionIds.Contains(ci.CollectionId))
            .Select(ci => ci.ItemId);

        // Topic members (#553): visible questions on a path that is still live and that an accessible collection holds.
        // Visibility is the item's own (public and media-eligible, or the caller's own), so another user's private match never
        // appears, and the owner sees only their own. Path liveness is checked against KeywordRelations at each level.
        IQueryable<Guid> topicItems = db.Items
            .Where(ItemVisibility.VisibleTo(viewerId))
            .Where(i => db.CollectionKeywordMembers.Any(m =>
                collectionIds.Contains(m.ParentId)
                && m.CategoryId == i.CategoryId
                && m.Keyword1Id == i.NavigationKeywordId1
                && (m.Keyword2Id == null || m.Keyword2Id == i.NavigationKeywordId2)
                && db.KeywordRelations.Any(r => r.CategoryId == m.CategoryId && r.ParentKeywordId == null && r.ChildKeywordId == m.Keyword1Id)
                && (m.Keyword2Id == null
                    || db.KeywordRelations.Any(r => r.CategoryId == m.CategoryId && r.ParentKeywordId == m.Keyword1Id && r.ChildKeywordId == m.Keyword2Id))))
            .Select(i => i.Id);

        return directAndNested.Union(topicItems);
    }

    /// <summary>
    /// Whether <paramref name="itemId"/> is an accessible member of <paramref name="collectionId"/>, counting nested and live
    /// topic membership exactly as <see cref="AccessibleMemberItemIds"/> does. Used by picture delivery and reporting so they
    /// cannot disagree with the roster.
    /// </summary>
    public static Task<bool> ContainsAsync(ApplicationDbContext db, Guid collectionId, Guid itemId, string? viewerId, CancellationToken cancellationToken) =>
        AccessibleMemberItemIds(db, collectionId, viewerId).AnyAsync(id => id == itemId, cancellationToken);

    /// <summary>A topic member whose path is still live in KeywordRelations (L1 root; L2 under its first keyword).</summary>
    public static Expression<Func<CollectionKeywordMember, bool>> LivePath(ApplicationDbContext db) =>
        m => db.KeywordRelations.Any(r => r.CategoryId == m.CategoryId && r.ParentKeywordId == null && r.ChildKeywordId == m.Keyword1Id)
            && (m.Keyword2Id == null
                || db.KeywordRelations.Any(r => r.CategoryId == m.CategoryId && r.ParentKeywordId == m.Keyword1Id && r.ChildKeywordId == m.Keyword2Id));
}
