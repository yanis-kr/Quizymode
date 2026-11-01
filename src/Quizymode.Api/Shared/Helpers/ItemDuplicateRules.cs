namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Duplicate rule for user-created items (AC 2.1.21): same question text (case-insensitive) or same SimHash,
/// AND the same question image key (no image equals no image). Text-only copies of a picture question are allowed.
/// </summary>
internal static class ItemDuplicateRules
{
    internal static bool IsDuplicate(
        string existingQuestion,
        string existingFuzzySignature,
        string? existingImageKey,
        string newQuestion,
        string newFuzzySignature,
        string? newImageKey)
    {
        bool sameText = string.Equals(existingQuestion, newQuestion, StringComparison.OrdinalIgnoreCase)
            || existingFuzzySignature == newFuzzySignature;

        return sameText && string.Equals(existingImageKey, newImageKey, StringComparison.Ordinal);
    }
}
