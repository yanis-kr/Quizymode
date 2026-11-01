using System.Text.RegularExpressions;
using FluentValidation;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Shared rules for the optional curated question picture (#407). The key must name a bundled asset
/// (<c>curated:&lt;folder&gt;/&lt;name&gt;</c>, lowercase letters, digits and hyphens); alt text is required.
/// </summary>
internal static partial class ItemImageReferenceHelper
{
    internal const int MaxKeyLength = 100;
    internal const int MaxAltTextLength = 300;
    internal const string InvalidKeyMessage = "Question image key must look like 'curated:folder/name' (lowercase letters, digits, hyphens; max 100 characters).";
    internal const string InvalidAltTextMessage = "Question image alt text is required (1-300 characters, no line breaks or control characters).";

    [GeneratedRegex("^curated:[a-z0-9-]+(/[a-z0-9-]+)+$", RegexOptions.CultureInvariant)]
    private static partial Regex KeyRegex();

    /// <summary>Trims key and alt text; returns null when no key is present.</summary>
    internal static ItemImageReference? Normalize(ItemImageReference? image)
    {
        if (image is null) return null;
        return new ItemImageReference(image.Key?.Trim() ?? string.Empty, image.AltText?.Trim() ?? string.Empty);
    }

    internal static bool IsValidKey(string? key) =>
        !string.IsNullOrEmpty(key) && key.Length <= MaxKeyLength && KeyRegex().IsMatch(key);

    internal static bool IsValidAltText(string? altText)
    {
        if (string.IsNullOrWhiteSpace(altText)) return false;
        string trimmed = altText.Trim();
        if (trimmed.Length > MaxAltTextLength) return false;
        foreach (char c in trimmed)
        {
            if (char.IsControl(c)) return false;
        }

        return true;
    }

    /// <summary>The stored image key, or null when the item has no picture.</summary>
    internal static string? KeyOf(ItemImageReference? image) => image?.Key;

    internal static ItemImageReference? FromColumns(string? key, string? altText) =>
        key is null ? null : new ItemImageReference(key, altText ?? string.Empty);

    /// <summary>Adds key format and alt text rules for an optional image reference.</summary>
    internal static void AddQuestionImageRules<T>(
        this AbstractValidator<T> validator,
        System.Linq.Expressions.Expression<Func<T, ItemImageReference?>> expression)
    {
        validator.RuleFor(expression)
            .Must(image => image is null || IsValidKey(image.Key?.Trim()))
            .WithMessage(InvalidKeyMessage);

        validator.RuleFor(expression)
            .Must(image => image is null || IsValidAltText(image.AltText))
            .WithMessage(InvalidAltTextMessage);
    }
}
