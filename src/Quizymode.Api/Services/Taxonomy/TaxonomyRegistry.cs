using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Taxonomy;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Services.Taxonomy;

internal sealed class TaxonomyRegistry : ITaxonomyRegistry
{
    private readonly IReadOnlyDictionary<string, TaxonomyCategoryDefinition> _categories;
    private readonly IReadOnlyList<string> _categorySlugs;

    public TaxonomyRegistry(
        IHostEnvironment environment,
        IOptions<TaxonomyOptions> options,
        ILogger<TaxonomyRegistry> logger)
    {
        _categories = TaxonomyYamlLoader.Load(environment, options.Value);
        _categorySlugs = _categories.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList();
        logger.LogInformation("Loaded taxonomy with {Count} categories.", _categories.Count);
    }

    public IReadOnlyList<string> CategorySlugs => _categorySlugs;

    public bool HasCategory(string categoryName)
    {
        if (string.IsNullOrWhiteSpace(categoryName))
            return false;
        return _categories.ContainsKey(categoryName.Trim());
    }

    public TaxonomyCategoryDefinition? GetCategory(string categoryName)
    {
        if (string.IsNullOrWhiteSpace(categoryName))
            return null;
        return _categories.TryGetValue(categoryName.Trim(), out TaxonomyCategoryDefinition? c) ? c : null;
    }

    public bool IsValidNavigationPath(string categoryName, string l1, string l2)
    {
        TaxonomyCategoryDefinition? cat = GetCategory(categoryName);
        if (cat is null)
            return false;

        string n1 = Normalize(l1);
        string n2 = Normalize(l2);
        if (string.IsNullOrEmpty(n1) || string.IsNullOrEmpty(n2))
            return false;

        foreach (TaxonomyL1Group g in cat.L1Groups)
        {
            if (!string.Equals(g.Slug, n1, StringComparison.OrdinalIgnoreCase))
                continue;
            return g.L2Leaves.Any(leaf => string.Equals(leaf.Slug, n2, StringComparison.OrdinalIgnoreCase));
        }

        return false;
    }

    public bool IsTaxonomyKeywordInCategory(string categoryName, string keywordNormalized)
    {
        TaxonomyCategoryDefinition? cat = GetCategory(categoryName);
        if (cat is null)
            return false;
        string n = Normalize(keywordNormalized);
        return !string.IsNullOrEmpty(n) && cat.AllKeywordSlugs.Contains(n);
    }

    private static string Normalize(string? s)
    {
        if (string.IsNullOrWhiteSpace(s))
            return "";
        return s.Trim().ToLowerInvariant();
    }
}
