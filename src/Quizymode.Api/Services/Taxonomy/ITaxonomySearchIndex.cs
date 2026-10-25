namespace Quizymode.Api.Services.Taxonomy;

[Flags]
public enum TaxonomyNodeLevels
{
    None = 0,
    Category = 1,
    L1 = 2,
    L2 = 4,
    Subcategories = L1 | L2,
    All = Category | L1 | L2
}

/// <summary>
/// One searchable taxonomy node. Slugs repeat across categories (for example <c>general</c>), so a node is
/// identified by the (category, L1, L2) triple.
/// </summary>
public sealed record TaxonomySearchNode(
    TaxonomyNodeLevels Level,
    string CategorySlug,
    string? L1Slug,
    string? L2Slug,
    string CategoryName,
    string Description,
    int PublicItemCount);

public sealed record TaxonomySearchHit(TaxonomySearchNode Node, double Score, IReadOnlyList<string> MatchedTerms);

/// <summary>In-memory search over the YAML taxonomy (categories, L1 and L2 nodes).</summary>
public interface ITaxonomySearchIndex
{
    IReadOnlyList<TaxonomySearchNode> Nodes { get; }

    DateTimeOffset? CountsRefreshedAtUtc { get; }

    TaxonomySearchNode? Find(string categorySlug, string? l1Slug, string? l2Slug);

    IReadOnlyList<TaxonomySearchHit> Search(string query, TaxonomyNodeLevels levels, int limit, int offset);

    /// <summary>Atomically swaps in new public item counts, keyed by (category, L1, L2) with null for the higher levels.</summary>
    void ReplaceCounts(IReadOnlyDictionary<(string Category, string? L1, string? L2), int> counts, DateTimeOffset refreshedAtUtc);
}
