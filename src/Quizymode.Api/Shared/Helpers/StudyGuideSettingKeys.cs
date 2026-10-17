using System.Globalization;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Admin-only per-user settings for study guide generation (AC 5.1): <see cref="Premium"/> (<c>"true"</c>/<c>"false"</c>)
/// selects the premium quota tier; <see cref="DailySections"/> and <see cref="MonthlySections"/> (integers 0–100000, or
/// <c>""</c> to clear) override the tier's section limits. Users cannot set these keys themselves.
/// </summary>
internal static class StudyGuideSettingKeys
{
    public const string Premium = "StudyGuidePremium";
    public const string DailySections = "StudyGuideDailySections";
    public const string MonthlySections = "StudyGuideMonthlySections";
    public const int MaxSectionOverride = 100_000;

    public static readonly IReadOnlySet<string> AdminOnly = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        Premium,
        DailySections,
        MonthlySections
    };

    /// <summary>Null when the value is valid for the key (or the key is not a study guide key); otherwise an error message.</summary>
    public static string? Validate(string key, string? value)
    {
        string trimmed = value?.Trim() ?? string.Empty;
        if (string.Equals(key, Premium, StringComparison.OrdinalIgnoreCase))
        {
            return trimmed.Length == 0 || bool.TryParse(trimmed, out _)
                ? null
                : $"{Premium} must be \"true\" or \"false\".";
        }

        if (string.Equals(key, DailySections, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(key, MonthlySections, StringComparison.OrdinalIgnoreCase))
        {
            return trimmed.Length == 0 ||
                   (int.TryParse(trimmed, NumberStyles.None, CultureInfo.InvariantCulture, out int number) && number <= MaxSectionOverride)
                ? null
                : $"{key} must be a whole number from 0 to {MaxSectionOverride}, or empty to use the default.";
        }

        return null;
    }

    /// <summary>The canonical casing of a study guide key, or <paramref name="key"/> unchanged for other keys.</summary>
    public static string Canonicalize(string key) =>
        AdminOnly.Contains(key)
            ? new[] { Premium, DailySections, MonthlySections }.First(known => string.Equals(known, key, StringComparison.OrdinalIgnoreCase))
            : key;

    public static bool IsPremium(string? value) => bool.TryParse(value?.Trim(), out bool premium) && premium;

    public static int? ParseOverride(string? value) =>
        int.TryParse(value?.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out int number) && number <= MaxSectionOverride
            ? number
            : null;
}
