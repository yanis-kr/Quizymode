using System.Text.RegularExpressions;

namespace Quizymode.Taxonomy;

/// <summary>URL slug for keyword names (aligned with API keyword slug rules).</summary>
public static class TaxonomyKeywordSlug
{
    public static string FromName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return string.Empty;

        string s = name.Trim().ToLowerInvariant();
        s = Regex.Replace(s, @"[^\w\s-]", "");
        s = Regex.Replace(s, @"\s+", "-");
        s = Regex.Replace(s, @"-+", "-").Trim('-');
        return s;
    }
}
