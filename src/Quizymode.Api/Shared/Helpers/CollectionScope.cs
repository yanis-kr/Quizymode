using Quizymode.Api.Data;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Single read path for the items a collection contains (#551, item 1).
/// Returns a query, not a materialized list, so a caller that filters on it runs one SQL statement with a subquery
/// instead of a round trip plus an IN list.
/// Scope of this step: direct members only. Nested collections (#552) and topic members (#553) are not stored yet,
/// so the set is the root's CollectionItems rows. The recursive walk with depth, cycle and size limits is added with #552.
/// </summary>
internal static class CollectionScope
{
    /// <summary>Item ids that are direct members of <paramref name="collectionId"/>, as a composable query.</summary>
    public static IQueryable<Guid> DirectMemberItemIds(ApplicationDbContext db, Guid collectionId) =>
        db.CollectionItems
            .Where(ci => ci.CollectionId == collectionId)
            .Select(ci => ci.ItemId);
}
