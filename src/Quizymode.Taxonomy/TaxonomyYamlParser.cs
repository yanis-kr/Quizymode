using YamlDotNet.RepresentationModel;

namespace Quizymode.Taxonomy;

/// <summary>Parses <c>quizymode_taxonomy.yaml</c> into category definitions (shared by API and codegen).</summary>
public static class TaxonomyYamlParser
{
    public static IReadOnlyDictionary<string, TaxonomyCategoryDefinition> LoadFromFile(string yamlPath)
    {
        using StreamReader reader = File.OpenText(yamlPath);
        YamlStream yaml = new();
        yaml.Load(reader);

        if (yaml.Documents.Count == 0)
            throw new InvalidOperationException("Taxonomy YAML is empty.");

        if (yaml.Documents[0].RootNode is not YamlMappingNode root)
            throw new InvalidOperationException("Taxonomy YAML root must be a mapping.");

        Dictionary<string, TaxonomyCategoryDefinition> categories = new(StringComparer.OrdinalIgnoreCase);

        foreach (KeyValuePair<YamlNode, YamlNode> entry in root.Children)
        {
            if (entry.Key is not YamlScalarNode keyNode)
                continue;

            string categorySlug = keyNode.Value?.Trim().ToLowerInvariant() ?? "";
            if (string.IsNullOrEmpty(categorySlug))
                continue;

            if (categorySlug.Equals("concerns", StringComparison.OrdinalIgnoreCase))
                continue;

            if (entry.Value is not YamlMappingNode categoryMap)
                continue;

            if (!TryGetChildScalar(categoryMap, "description", out string categoryDescription))
                continue;

            if (!TryGetChildMapping(categoryMap, "keywords", out YamlMappingNode? l1RootMaybe) || l1RootMaybe is null)
                continue;

            YamlMappingNode l1Root = l1RootMaybe;

            List<TaxonomyL1Group> l1Groups = [];
            HashSet<string> allSlugs = new(StringComparer.OrdinalIgnoreCase);

            foreach (KeyValuePair<YamlNode, YamlNode> l1Entry in l1Root.Children)
            {
                if (l1Entry.Key is not YamlScalarNode l1KeyNode)
                    continue;

                string l1Slug = NormalizeSlug(l1KeyNode.Value);
                if (string.IsNullOrEmpty(l1Slug))
                    continue;

                if (l1Entry.Value is not YamlMappingNode l1Map)
                    continue;

                if (!TryGetChildScalar(l1Map, "description", out string l1Description))
                    continue;

                if (!TryGetChildMapping(l1Map, "keywords", out YamlMappingNode? l2MapMaybe) || l2MapMaybe is null)
                    continue;

                YamlMappingNode l2Map = l2MapMaybe;

                List<TaxonomyL2Leaf> l2Leaves = [];
                foreach (KeyValuePair<YamlNode, YamlNode> l2Entry in l2Map.Children)
                {
                    if (l2Entry.Key is not YamlScalarNode l2KeyNode)
                        continue;

                    string l2Slug = NormalizeSlug(l2KeyNode.Value);
                    if (string.IsNullOrEmpty(l2Slug))
                        continue;

                    string l2Desc = l2Entry.Value is YamlScalarNode l2DescSc
                        ? (l2DescSc.Value ?? "").Trim()
                        : "";

                    l2Leaves.Add(new TaxonomyL2Leaf { Slug = l2Slug, Description = l2Desc });
                    allSlugs.Add(l2Slug);
                }

                allSlugs.Add(l1Slug);
                l1Groups.Add(new TaxonomyL1Group
                {
                    Slug = l1Slug,
                    Description = l1Description,
                    L2Leaves = l2Leaves
                });
            }

            categories[categorySlug] = new TaxonomyCategoryDefinition
            {
                Slug = categorySlug,
                Description = categoryDescription,
                L1Groups = l1Groups,
                AllKeywordSlugs = allSlugs
            };
        }

        return categories;
    }

    private static string NormalizeSlug(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "";
        return value.Trim().ToLowerInvariant();
    }

    private static bool TryGetChildScalar(YamlMappingNode parent, string key, out string value)
    {
        value = "";
        foreach (KeyValuePair<YamlNode, YamlNode> child in parent.Children)
        {
            if (child.Key is YamlScalarNode sk && string.Equals(sk.Value, key, StringComparison.OrdinalIgnoreCase)
                && child.Value is YamlScalarNode vs)
            {
                value = (vs.Value ?? "").Trim();
                return true;
            }
        }

        return false;
    }

    private static bool TryGetChildMapping(YamlMappingNode parent, string key, out YamlMappingNode? mapping)
    {
        mapping = null;
        foreach (KeyValuePair<YamlNode, YamlNode> child in parent.Children)
        {
            if (child.Key is YamlScalarNode sk && string.Equals(sk.Value, key, StringComparison.OrdinalIgnoreCase)
                && child.Value is YamlMappingNode mm)
            {
                mapping = mm;
                return true;
            }
        }

        return false;
    }
}
