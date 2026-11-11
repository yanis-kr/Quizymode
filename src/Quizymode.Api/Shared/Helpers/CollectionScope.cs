using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Single read path for the items a collection contains (#551, #552).
/// Every query method returns a composable query, not a materialized list, so a caller that filters on it runs one SQL statement.
/// Nested members are walked with an unrolled, fixed number of levels (<see cref="CollectionMembers.MaxDepth"/>), so a cycle
/// stored in the data still terminates. The child visibility check runs inside SQL at each level.
/// Safety limits (#549): depth 3, 50 collections per read and 500 membership rows per collection. A result cut by a limit is
/// reported by <see cref="IncompleteReasonAsync"/>. The root collection's own direct items are never cut (AC 1.16.6).
/// Row budget of one collection: child links and topic rows come first (ordered by AddedAt, Id; the first 500 are kept) and the
/// items fill what is left, in the same order. Hidden rows count. Ranks are computed only for a collection that holds more than
/// 500 rows, so a normal collection pays one cheap count per collection and nothing per row.
/// <see cref="ResolveManyAsync"/> is the batched form for list cards; it applies the same rules in a fixed number of queries.
/// </summary>
internal static class CollectionScope
{
    /// <summary>The read resolved more than <see cref="CollectionMembers.MaxReadCollections"/> collections.</summary>
    public const string CollectionLimitReason = "CollectionLimit";

    /// <summary>A collection holds more than <see cref="CollectionMembers.MaxMembershipRows"/> membership rows, so the later rows were left out.</summary>
    public const string MembershipRowLimitReason = "MembershipRowLimit";

    /// <summary>A visible child collection exists below <see cref="CollectionMembers.MaxDepth"/> levels and was not read.</summary>
    public const string DepthLimitReason = "DepthLimit";

    /// <summary>Item ids that are direct members of <paramref name="collectionId"/>, as a composable query.</summary>
    public static IQueryable<Guid> DirectMemberItemIds(ApplicationDbContext db, Guid collectionId) =>
        db.CollectionItems
            .Where(ci => ci.CollectionId == collectionId)
            .Select(ci => ci.ItemId);

    /// <summary>
    /// Child link whose child collection the viewer may open (public, or owned by the viewer). One predicate for every reader:
    /// the walk uses it positively and the hidden-placeholder count (#554) uses <see cref="HiddenChildLink"/>.
    /// </summary>
    public static Expression<Func<CollectionCollectionMember, bool>> VisibleChildLink(ApplicationDbContext db, string? viewerId)
    {
        string callerId = viewerId ?? string.Empty;
        bool hasCaller = callerId.Length > 0;
        return m => db.Collections.Any(c => c.Id == m.ChildId && (c.IsPublic || (hasCaller && c.CreatedBy == callerId)));
    }

    /// <summary>The exact negation of <see cref="VisibleChildLink"/>: a child link the viewer cannot open.</summary>
    public static Expression<Func<CollectionCollectionMember, bool>> HiddenChildLink(ApplicationDbContext db, string? viewerId)
    {
        Expression<Func<CollectionCollectionMember, bool>> visible = VisibleChildLink(db, viewerId);
        return Expression.Lambda<Func<CollectionCollectionMember, bool>>(Expression.Not(visible.Body), visible.Parameters);
    }

    /// <summary>
    /// A collection whose rows exceed the budget: items, child links and topic rows together for a nested collection; child links and
    /// topic rows for the root (its items are never cut). One count per collection, never per row.
    /// </summary>
    private static Expression<Func<Guid, bool>> IsOverfull(ApplicationDbContext db, Guid rootId) =>
        c => (c != rootId ? db.CollectionItems.Count(ci => ci.CollectionId == c) : 0)
            + db.CollectionCollectionMembers.Count(m => m.ParentId == c)
            + db.CollectionKeywordMembers.Count(t => t.ParentId == c) > CollectionMembers.MaxMembershipRows;

    // The kept-row predicates decide "is this row's collection over budget" from the row's own parent id, so no query re-embeds the
    // walk's frontier and the SQL grows linearly with the depth. The rank runs only after the cheap count says the parent is over 500 rows.

    /// <summary>Child links are ranked with the topic rows of their parent.</summary>
    // A parent with at most 500 rows has every rank below 500, so the rank check alone decides. Dropping the total-count branch
    // keeps the same rows and halves the SQL text of each predicate (#593).
    private static Expression<Func<CollectionCollectionMember, bool>> LinkKept(ApplicationDbContext db) =>
        m => db.CollectionCollectionMembers.Count(o => o.ParentId == m.ParentId
                    && (o.AddedAt < m.AddedAt || (o.AddedAt == m.AddedAt && o.Id.CompareTo(m.Id) < 0)))
                + db.CollectionKeywordMembers.Count(o => o.ParentId == m.ParentId
                    && (o.AddedAt < m.AddedAt || (o.AddedAt == m.AddedAt && o.Id.CompareTo(m.Id) < 0)))
                < CollectionMembers.MaxMembershipRows;

    private static Expression<Func<CollectionKeywordMember, bool>> TopicKept(ApplicationDbContext db) =>
        m => db.CollectionCollectionMembers.Count(o => o.ParentId == m.ParentId
                    && (o.AddedAt < m.AddedAt || (o.AddedAt == m.AddedAt && o.Id.CompareTo(m.Id) < 0)))
                + db.CollectionKeywordMembers.Count(o => o.ParentId == m.ParentId
                    && (o.AddedAt < m.AddedAt || (o.AddedAt == m.AddedAt && o.Id.CompareTo(m.Id) < 0)))
                < CollectionMembers.MaxMembershipRows;

    /// <summary>Items of a nested collection fill the budget left after its child links and topic rows. The root's items are never cut.</summary>
    private static Expression<Func<CollectionItem, bool>> ItemRowKept(ApplicationDbContext db, Guid rootId) =>
        ci => ci.CollectionId == rootId
            || db.CollectionItems.Count(o => o.CollectionId == ci.CollectionId
                    && (o.AddedAt < ci.AddedAt || (o.AddedAt == ci.AddedAt && o.Id.CompareTo(ci.Id) < 0)))
                < CollectionMembers.MaxMembershipRows
                    - (db.CollectionCollectionMembers.Count(o => o.ParentId == ci.CollectionId)
                        + db.CollectionKeywordMembers.Count(o => o.ParentId == ci.CollectionId));

    /// <summary>
    /// Ids of the collections reachable from <paramref name="rootId"/> through nested links that the viewer may open:
    /// the root itself, plus child collections that are public or owned by <paramref name="viewerId"/>, up to
    /// <see cref="CollectionMembers.MaxDepth"/> levels. A private child hidden from the viewer hides its whole subtree.
    /// A link past its parent's membership-row budget is not followed.
    /// </summary>
    public static IQueryable<Guid> AccessibleCollectionIds(ApplicationDbContext db, Guid rootId, string? viewerId) =>
        Walk(db, rootId, viewerId);

    /// <summary>
    /// Every collection reachable from the root in at most <see cref="CollectionMembers.MaxDepth"/> hops. Each hop is
    /// root ∪ children(previous set), so the set at hop k is the union of the exact-depth sets 0..k. Each hop's SQL text
    /// embeds the previous set once (not once per depth), which halves the walk's text against a union of exact levels (#593).
    /// </summary>
    private static IQueryable<Guid> Walk(ApplicationDbContext db, Guid rootId, string? viewerId)
    {
        Expression<Func<CollectionCollectionMember, bool>> visible = VisibleChildLink(db, viewerId);
        Expression<Func<CollectionCollectionMember, bool>> kept = LinkKept(db);

        IQueryable<Guid> root = db.Collections.Where(c => c.Id == rootId).Select(c => c.Id);
        IQueryable<Guid> reached = root;

        for (int depth = 1; depth <= CollectionMembers.MaxDepth; depth++)
        {
            IQueryable<Guid> frontier = reached;
            IQueryable<Guid> children = db.CollectionCollectionMembers
                .Where(m => frontier.Contains(m.ParentId))
                .Where(visible)
                .Where(kept)
                .Select(m => m.ChildId);

            reached = root.Union(children);
        }

        return reached;
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
    /// Why the resolution from <paramref name="rootId"/> left content out, or null when it is complete (AC 1.16.7). One SQL statement.
    /// Precedence: <see cref="CollectionLimitReason"/>, then <see cref="MembershipRowLimitReason"/>, then <see cref="DepthLimitReason"/>.
    /// A cycle alone is not incomplete: the depth reason needs a visible child at level 4 that has not been visited.
    /// </summary>
    public static async Task<string?> IncompleteReasonAsync(ApplicationDbContext db, Guid rootId, string? viewerId, CancellationToken cancellationToken)
    {
        IQueryable<Guid> accessible = Walk(db, rootId, viewerId);
        IOrderedQueryable<Guid> ordered = CapOrder(accessible, rootId);
        IQueryable<Guid> capped = ordered.Take(CollectionMembers.MaxReadCollections);
        Expression<Func<CollectionCollectionMember, bool>> visible = VisibleChildLink(db, viewerId);
        Expression<Func<Guid, bool>> isOverfull = IsOverfull(db, rootId);
        Expression<Func<CollectionCollectionMember, bool>> kept = LinkKept(db);

        var flags = await db.Collections
            .Where(c => c.Id == rootId)
            .Select(c => new
            {
                CollectionLimit = ordered.Skip(CollectionMembers.MaxReadCollections).Any(),
                RowLimit = capped.Any(isOverfull),
                // A visible, kept link from a node reached within the walk whose child was not reached. Parents above the last level
                // always reach their children, so this is the same as checking only the last level.
                DepthLimit = db.CollectionCollectionMembers
                    .Where(m => accessible.Contains(m.ParentId))
                    .Where(visible)
                    .Where(kept)
                    .Any(m => !accessible.Contains(m.ChildId))
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (flags is null)
        {
            return null;
        }

        if (flags.CollectionLimit)
        {
            return CollectionLimitReason;
        }

        if (flags.RowLimit)
        {
            return MembershipRowLimitReason;
        }

        return flags.DepthLimit ? DepthLimitReason : null;
    }

    /// <summary>
    /// Item ids of every accessible member of <paramref name="rootId"/>: its direct items and the items of accessible nested
    /// collections, as a distinct set. Nested collections beyond the read cap are not included, and a nested collection's rows
    /// past <see cref="CollectionMembers.MaxMembershipRows"/> are left out (AC 1.16.6). The root's own direct items are never cut.
    /// </summary>
    public static IQueryable<Guid> AccessibleMemberItemIds(ApplicationDbContext db, Guid rootId, string? viewerId)
    {
        IQueryable<Guid> collectionIds = CappedCollectionIds(db, rootId, viewerId);

        IQueryable<Guid> directAndNested = db.CollectionItems
            .Where(ci => collectionIds.Contains(ci.CollectionId))
            .Where(ItemRowKept(db, rootId))
            .Select(ci => ci.ItemId);

        // Topic members (#553): visible questions on a path that is still live and that an accessible collection holds.
        // Visibility is the item's own (public and media-eligible, or the caller's own), so another user's private match never
        // appears, and the owner sees only their own. Path liveness is checked against KeywordRelations at each level.
        IQueryable<CollectionKeywordMember> topics = db.CollectionKeywordMembers
            .Where(m => collectionIds.Contains(m.ParentId))
            .Where(TopicKept(db))
            .Where(LivePath(db));

        IQueryable<Guid> topicItems = db.Items
            .Where(ItemVisibility.VisibleTo(viewerId))
            .Where(i => topics.Any(m =>
                m.CategoryId == i.CategoryId
                && m.Keyword1Id == i.NavigationKeywordId1
                && (m.Keyword2Id == null || m.Keyword2Id == i.NavigationKeywordId2)))
            .Select(i => i.Id);

        return directAndNested.Union(topicItems);
    }

    /// <summary>
    /// Whether the root holds any child link or topic row at all. Every row counts, hidden child links included (never
    /// <see cref="VisibleChildLink"/>), so a root with hidden links or topics still takes the full resolution and its row limit.
    /// </summary>
    public static async Task<bool> HasStructureAsync(ApplicationDbContext db, Guid rootId, CancellationToken cancellationToken) =>
        await db.Collections
            .Where(c => c.Id == rootId)
            .Select(c => db.CollectionCollectionMembers.Any(m => m.ParentId == c.Id) || db.CollectionKeywordMembers.Any(t => t.ParentId == c.Id))
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// The roster query for the list read. A root with no structure (<paramref name="hasStructure"/> false, from
    /// <see cref="HasStructureAsync"/>) is flat: only its direct items, which are never cut, so the walk and the row budget are skipped.
    /// Otherwise it is <see cref="AccessibleMemberItemIds"/>. <see cref="ContainsAsync"/> always uses the full path.
    /// </summary>
    public static IQueryable<Guid> RosterItemIds(ApplicationDbContext db, Guid rootId, string? viewerId, bool hasStructure) =>
        hasStructure ? AccessibleMemberItemIds(db, rootId, viewerId) : DirectMemberItemIds(db, rootId);

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

    /// <summary>One root's batched resolution: the collections it reads and how many visible child links it holds itself.</summary>
    public sealed record Resolution(HashSet<Guid> Collections, int ChildLinkCount);

    /// <summary>Rows left out by the per-collection budget, found only for the collections that hold more than 500 rows.</summary>
    public sealed class RowBudget
    {
        private readonly HashSet<Guid> _droppedNonItemRows = [];
        private readonly HashSet<Guid> _droppedItemRows = [];

        internal void DropNonItem(Guid rowId) => _droppedNonItemRows.Add(rowId);

        internal void DropItem(Guid rowId) => _droppedItemRows.Add(rowId);

        /// <summary>A child link or topic row past the first 500 of its collection.</summary>
        public bool IsNonItemRowDropped(Guid rowId) => _droppedNonItemRows.Contains(rowId);

        /// <summary>An item row of a nested collection past its budget. The root's own item rows are never dropped.</summary>
        public bool IsItemRowDropped(Guid rootId, Guid collectionId, Guid rowId) =>
            collectionId != rootId && _droppedItemRows.Contains(rowId);
    }

    public sealed record BatchResult(Dictionary<Guid, Resolution> Roots, RowBudget Budget);

    private sealed record LinkRow(Guid Id, Guid ParentId, Guid ChildId);

    private sealed record RawRow(Guid CollectionId, DateTime AddedAt, Guid Id);

    /// <summary>
    /// Resolves many roots together in a fixed number of queries, whatever the number of roots: one per level of the walk, one count
    /// of rows per reached collection, and three more only when some collection holds more than 500 rows. Same rules as the single-root
    /// query path: visibility per level, a visited set, the row budget and the cap of <see cref="CollectionMembers.MaxReadCollections"/>
    /// collections (the root first, then by id).
    /// </summary>
    public static async Task<BatchResult> ResolveManyAsync(
        ApplicationDbContext db,
        IReadOnlyCollection<Guid> roots,
        string? viewerId,
        CancellationToken cancellationToken)
    {
        Expression<Func<CollectionCollectionMember, bool>> visible = VisibleChildLink(db, viewerId);

        Dictionary<Guid, List<LinkRow>> linksByParent = new();
        List<Guid> frontier = roots.Distinct().ToList();
        HashSet<Guid> reached = [.. frontier];
        for (int depth = 1; depth <= CollectionMembers.MaxDepth && frontier.Count > 0; depth++)
        {
            List<Guid> parents = frontier;
            List<LinkRow> links = await db.CollectionCollectionMembers
                .Where(m => parents.Contains(m.ParentId))
                .Where(visible)
                .Select(m => new LinkRow(m.Id, m.ParentId, m.ChildId))
                .ToListAsync(cancellationToken);

            foreach (LinkRow link in links)
            {
                if (!linksByParent.TryGetValue(link.ParentId, out List<LinkRow>? list))
                {
                    list = [];
                    linksByParent[link.ParentId] = list;
                }

                list.Add(link);
                reached.Add(link.ChildId);
            }

            frontier = links.Select(l => l.ChildId).Distinct().ToList();
        }

        RowBudget budget = await LoadRowBudgetAsync(db, reached, cancellationToken);

        Dictionary<Guid, Resolution> result = new();
        foreach (Guid root in roots.Distinct())
        {
            HashSet<Guid> seen = [root];
            List<Guid> level = [root];
            for (int depth = 1; depth <= CollectionMembers.MaxDepth && level.Count > 0; depth++)
            {
                List<Guid> next = [];
                foreach (Guid parent in level)
                {
                    foreach (LinkRow link in KeptLinks(linksByParent, budget, parent).Where(l => seen.Add(l.ChildId)))
                    {
                        next.Add(link.ChildId);
                    }
                }

                level = next;
            }

            HashSet<Guid> capped = seen
                .OrderBy(id => id == root ? 0 : 1)
                .ThenBy(id => id)
                .Take(CollectionMembers.MaxReadCollections)
                .ToHashSet();

            result[root] = new Resolution(capped, KeptLinks(linksByParent, budget, root).Count());
        }

        return new BatchResult(result, budget);
    }

    private static IEnumerable<LinkRow> KeptLinks(Dictionary<Guid, List<LinkRow>> linksByParent, RowBudget budget, Guid parent) =>
        (linksByParent.GetValueOrDefault(parent) ?? []).Where(l => !budget.IsNonItemRowDropped(l.Id));

    /// <summary>
    /// One count per reached collection finds the ones over budget (rare). Only for those, the raw rows are loaded and ordered, and
    /// the rows past the budget are recorded. Hidden rows count, so the cut does not depend on the viewer.
    /// </summary>
    private static async Task<RowBudget> LoadRowBudgetAsync(ApplicationDbContext db, HashSet<Guid> reached, CancellationToken cancellationToken)
    {
        RowBudget budget = new();
        List<Guid> candidates = reached.ToList();
        List<Guid> overfull = await db.Collections
            .Where(c => candidates.Contains(c.Id))
            .Select(c => new
            {
                c.Id,
                Items = db.CollectionItems.Count(ci => ci.CollectionId == c.Id),
                NonItems = db.CollectionCollectionMembers.Count(m => m.ParentId == c.Id)
                    + db.CollectionKeywordMembers.Count(t => t.ParentId == c.Id)
            })
            .Where(x => x.NonItems > CollectionMembers.MaxMembershipRows
                || x.Items + x.NonItems > CollectionMembers.MaxMembershipRows)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);
        if (overfull.Count == 0)
        {
            return budget;
        }

        List<RawRow> links = await db.CollectionCollectionMembers
            .Where(m => overfull.Contains(m.ParentId))
            .Select(m => new RawRow(m.ParentId, m.AddedAt, m.Id))
            .ToListAsync(cancellationToken);
        List<RawRow> topics = await db.CollectionKeywordMembers
            .Where(m => overfull.Contains(m.ParentId))
            .Select(m => new RawRow(m.ParentId, m.AddedAt, m.Id))
            .ToListAsync(cancellationToken);
        List<RawRow> items = await db.CollectionItems
            .Where(ci => overfull.Contains(ci.CollectionId))
            .Select(ci => new RawRow(ci.CollectionId, ci.AddedAt, ci.Id))
            .ToListAsync(cancellationToken);

        // Ties on AddedAt break by id; the ordinal text order of a Guid matches both SQLite (text) and PostgreSQL (uuid) ordering.
        static IOrderedEnumerable<RawRow> InOrder(IEnumerable<RawRow> rows) =>
            rows.OrderBy(r => r.AddedAt).ThenBy(r => r.Id.ToString(), StringComparer.Ordinal);

        foreach (Guid collectionId in overfull)
        {
            List<RawRow> nonItems = InOrder(links.Concat(topics).Where(r => r.CollectionId == collectionId)).ToList();
            foreach (RawRow row in nonItems.Skip(CollectionMembers.MaxMembershipRows))
            {
                budget.DropNonItem(row.Id);
            }

            int itemBudget = Math.Max(0, CollectionMembers.MaxMembershipRows - nonItems.Count);
            foreach (RawRow row in InOrder(items.Where(r => r.CollectionId == collectionId)).Skip(itemBudget))
            {
                budget.DropItem(row.Id);
            }
        }

        return budget;
    }
}
