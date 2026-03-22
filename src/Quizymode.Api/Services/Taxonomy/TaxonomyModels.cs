namespace Quizymode.Api.Services.Taxonomy;

public sealed class TaxonomyCategoryDefinition
{
    public required string Slug { get; init; }
    public required string Description { get; init; }
    public required IReadOnlyList<TaxonomyL1Group> L1Groups { get; init; }

    /// <summary>All L1 and L2 slugs in this category (lowercase).</summary>
    public required IReadOnlySet<string> AllKeywordSlugs { get; init; }
}

public sealed class TaxonomyL1Group
{
    public required string Slug { get; init; }
    public required string Description { get; init; }
    public required IReadOnlyList<TaxonomyL2Leaf> L2Leaves { get; init; }
}

public sealed class TaxonomyL2Leaf
{
    public required string Slug { get; init; }
    public required string Description { get; init; }
}
