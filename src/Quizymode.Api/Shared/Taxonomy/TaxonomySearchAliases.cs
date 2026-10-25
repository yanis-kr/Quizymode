namespace Quizymode.Api.Shared.Taxonomy;

/// <summary>
/// Hand-kept expansions applied to taxonomy node text so searches such as "artificial intelligence" find
/// <c>tech › ai-ml</c> even though those words appear nowhere in the taxonomy YAML. Keys are single lowercase
/// tokens, because the search tokenizer splits on every non-alphanumeric character (so <c>ci-cd</c> is the
/// two tokens <c>ci</c> and <c>cd</c>).
/// </summary>
public static class TaxonomySearchAliases
{
    private static readonly IReadOnlyDictionary<string, string> Map = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["ai"] = "artificial intelligence",
        ["ml"] = "machine learning",
        ["llm"] = "large language models",
        ["llms"] = "large language models",
        ["nlp"] = "natural language processing",
        ["js"] = "javascript",
        ["k8s"] = "kubernetes",
        ["os"] = "operating systems",
        ["oop"] = "object oriented programming",
        ["iam"] = "identity access management",
        ["aws"] = "amazon web services",
        ["gcp"] = "google cloud platform",
        ["ci"] = "continuous integration",
        ["cd"] = "continuous delivery",
        ["sre"] = "site reliability engineering",
        ["bi"] = "business intelligence",
        ["db"] = "database"
    };

    public static int Count => Map.Count;

    /// <summary>The expansion tokens for a single lowercase token, or an empty list when there is no alias.</summary>
    public static IReadOnlyList<string> Expand(string token)
    {
        return Map.TryGetValue(token, out string? expansion)
            ? expansion.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            : [];
    }
}
