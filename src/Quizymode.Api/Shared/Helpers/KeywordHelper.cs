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
    /// Returns true if the name is valid for a new keyword: alphanumeric and hyphens only (no spaces or special chars).
    /// </summary>
    public static bool IsValidKeywordNameFormat(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return false;
        string trimmed = name.Trim();
        return Regex.IsMatch(trimmed, @"^[a-zA-Z0-9\-]+$") && trimmed.Length <= 30;
    }
}

