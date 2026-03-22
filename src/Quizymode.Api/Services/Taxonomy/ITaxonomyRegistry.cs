namespace Quizymode.Api.Services.Taxonomy;

public interface ITaxonomyRegistry
{
    IReadOnlyList<string> CategorySlugs { get; }

    bool HasCategory(string categoryName);

    TaxonomyCategoryDefinition? GetCategory(string categoryName);

    bool IsValidNavigationPath(string categoryName, string l1, string l2);

    /// <summary>True if keyword is an L1 or L2 slug for the category.</summary>
    bool IsTaxonomyKeywordInCategory(string categoryName, string keywordNormalized);
}
