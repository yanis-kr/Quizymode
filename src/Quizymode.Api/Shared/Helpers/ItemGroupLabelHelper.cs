using System.Globalization;
using System.Linq.Expressions;
using FluentValidation;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Shared rules for the optional item group label used by the Sort It game (#359).
/// Length is measured after trimming; line breaks, control and format characters are rejected.
/// </summary>
internal static class ItemGroupLabelHelper
{
    internal const int MaxLength = 30;
    internal const string TooLongMessage = "Group label must be 30 characters or fewer.";
    internal const string InvalidCharactersMessage = "Group label can't contain line breaks.";

    /// <summary>Trims the label and maps blank to null.</summary>
    internal static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim();
    }

    internal static bool HasValidLength(string? value) =>
        value is null || value.Trim().Length <= MaxLength;

    internal static bool HasValidCharacters(string? value)
    {
        if (value is null) return true;
        foreach (char c in value.Trim())
        {
            if (c is '\r' or '\n' || char.IsControl(c)
                || CharUnicodeInfo.GetUnicodeCategory(c) is UnicodeCategory.Format or UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator)
            {
                return false;
            }
        }
        return true;
    }

    /// <summary>Adds the group label length and character rules.</summary>
    internal static void AddGroupLabelRules<T>(
        this AbstractValidator<T> validator,
        Expression<Func<T, string?>> expression)
    {
        validator.RuleFor(expression)
            .Must(HasValidLength)
            .WithMessage(TooLongMessage);

        validator.RuleFor(expression)
            .Must(HasValidCharacters)
            .WithMessage(InvalidCharactersMessage);
    }
}
