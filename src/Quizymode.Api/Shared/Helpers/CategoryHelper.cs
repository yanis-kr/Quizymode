using System.Text.RegularExpressions;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Helper class for normalizing category names to ensure case-insensitive consistency.
/// </summary>
internal static class CategoryHelper
{
    /// <summary>
    /// Converts a category name to a URL-friendly slug (matches frontend categoryNameToSlug).
    /// Used to resolve category from URL slug when exact name match fails.
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
    /// Normalizes a category name to a standardized format:
    /// First letter capitalized, rest lowercase (e.g., "spanish" -> "Spanish", "SPANISH" -> "Spanish").
    /// </summary>
    /// <param name="name">The category name to normalize.</param>
    /// <returns>The normalized name with first letter capitalized and rest lowercase.</returns>
    public static string Normalize(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return string.Empty;
        }

        string trimmed = name.Trim();
        if (trimmed.Length == 0)
        {
            return string.Empty;
        }

        // Capitalize first letter, lowercase the rest
        if (trimmed.Length == 1)
        {
            return trimmed.ToUpperInvariant();
        }

        return char.ToUpperInvariant(trimmed[0]) + trimmed.Substring(1).ToLowerInvariant();
    }
}

