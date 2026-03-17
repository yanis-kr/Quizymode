using System.Text.RegularExpressions;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Helper class for normalizing keyword names to ensure consistent
/// comparison across URLs, queries, and navigation.
/// Mirrors the slug behavior used for categories.
/// </summary>
internal static class KeywordHelper
{
    /// <summary>
    /// Converts a keyword name to a URL-friendly slug.
    /// This is intentionally the same transformation as CategoryHelper.NameToSlug
    /// so that category and keyword segments follow the same rules.
    /// </summary>
    public static string NameToSlug(string name)
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

