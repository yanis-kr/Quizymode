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

    /// <summary>
    /// Normalizes a keyword name for storage/validation:
    /// - trims
    /// - replaces any whitespace sequence with a single hyphen
    /// - collapses multiple hyphens
    /// Does not change casing; callers may lower-case if desired.
    /// </summary>
    public static string NormalizeKeywordName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return string.Empty;

        string s = name.Trim();
        s = Regex.Replace(s, @"\s+", "-");
        s = Regex.Replace(s, @"-+", "-").Trim('-');
        return s;
    }

    /// <summary>
    /// Returns true if the name is valid for a new keyword: alphanumeric and hyphens only (no spaces or special chars),
    /// after applying NormalizeKeywordName.
    /// </summary>
    public static bool IsValidKeywordNameFormat(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return false;

        string normalized = NormalizeKeywordName(name);
        if (string.IsNullOrEmpty(normalized))
            return false;

        return Regex.IsMatch(normalized, @"^[a-zA-Z0-9\-]+$") && normalized.Length <= 30;
    }
}

