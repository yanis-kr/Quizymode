using System.Linq.Expressions;
using System.Text.RegularExpressions;
using FluentValidation;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Shared.Helpers;

internal static partial class ItemSpeechSupportHelper
{
    [GeneratedRegex("^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$", RegexOptions.Compiled)]
    private static partial Regex LanguageCodeRegex();

    public static bool IsValidLanguageCode(string? languageCode)
    {
        if (string.IsNullOrWhiteSpace(languageCode))
        {
            return true;
        }

        return LanguageCodeRegex().IsMatch(languageCode.Trim());
    }

    public static ItemSpeechSupport? Normalize(ItemSpeechSupport? support, int maxPronunciationLength)
    {
        if (support is null)
        {
            return null;
        }

        string? pronunciation = string.IsNullOrWhiteSpace(support.Pronunciation)
            ? null
            : support.Pronunciation.Trim();
        string? languageCode = string.IsNullOrWhiteSpace(support.LanguageCode)
            ? null
            : support.LanguageCode.Trim();

        if (pronunciation is not null && pronunciation.Length > maxPronunciationLength)
        {
            pronunciation = pronunciation[..maxPronunciationLength];
        }

        if (languageCode is not null && languageCode.Length > 35)
        {
            languageCode = languageCode[..35];
        }

        if (pronunciation is null && languageCode is null)
        {
            return null;
        }

        return new ItemSpeechSupport
        {
            Pronunciation = pronunciation,
            LanguageCode = languageCode
        };
    }

    public static Dictionary<int, ItemSpeechSupport> NormalizeDictionary(
        IDictionary<int, ItemSpeechSupport>? speechByIndex,
        int answerCount,
        int maxPronunciationLength)
    {
        Dictionary<int, ItemSpeechSupport> normalized = [];
        if (speechByIndex is null)
        {
            return normalized;
        }

        foreach ((int index, ItemSpeechSupport support) in speechByIndex)
        {
            if (index < 0 || index >= answerCount)
            {
                continue;
            }

            ItemSpeechSupport? normalizedSupport = Normalize(support, maxPronunciationLength);
            if (normalizedSupport is null)
            {
                continue;
            }

            normalized[index] = normalizedSupport;
        }

        return normalized;
    }

    public static bool AreEquivalent(ItemSpeechSupport? left, ItemSpeechSupport? right)
    {
        ItemSpeechSupport? normalizedLeft = Normalize(left, int.MaxValue);
        ItemSpeechSupport? normalizedRight = Normalize(right, int.MaxValue);

        if (normalizedLeft is null || normalizedRight is null)
        {
            return normalizedLeft is null && normalizedRight is null;
        }

        return string.Equals(normalizedLeft.Pronunciation, normalizedRight.Pronunciation, StringComparison.Ordinal)
            && string.Equals(normalizedLeft.LanguageCode, normalizedRight.LanguageCode, StringComparison.OrdinalIgnoreCase);
    }

    public static bool AreEquivalent(
        IReadOnlyDictionary<int, ItemSpeechSupport>? left,
        IReadOnlyDictionary<int, ItemSpeechSupport>? right)
    {
        Dictionary<int, ItemSpeechSupport> normalizedLeft = NormalizeDictionary(
            left is null ? null : new Dictionary<int, ItemSpeechSupport>(left),
            int.MaxValue,
            int.MaxValue);
        Dictionary<int, ItemSpeechSupport> normalizedRight = NormalizeDictionary(
            right is null ? null : new Dictionary<int, ItemSpeechSupport>(right),
            int.MaxValue,
            int.MaxValue);

        if (normalizedLeft.Count != normalizedRight.Count)
        {
            return false;
        }

        foreach ((int index, ItemSpeechSupport leftSupport) in normalizedLeft)
        {
            if (!normalizedRight.TryGetValue(index, out ItemSpeechSupport? rightSupport))
            {
                return false;
            }

            if (!AreEquivalent(leftSupport, rightSupport))
            {
                return false;
            }
        }

        return true;
    }
}

/// <summary>
/// FluentValidation extension methods for reusing speech-support validation rules across
/// AddItem, UpdateItem, AddItemsBulk, and SeedSyncAdmin validators.
/// </summary>
internal static class ItemSpeechSupportValidatorExtensions
{
    /// <summary>Adds pronunciation-length and BCP-47 language-code rules for a nullable speech-support field.</summary>
    internal static void AddSpeechSupportRules<T>(
        this AbstractValidator<T> validator,
        Expression<Func<T, ItemSpeechSupport?>> expression,
        int maxPronunciationLength,
        string fieldName)
    {
        validator.RuleFor(expression)
            .Must(support => support is null
                || string.IsNullOrWhiteSpace(support.Pronunciation)
                || support.Pronunciation.Trim().Length <= maxPronunciationLength)
            .WithMessage($"{fieldName}.Pronunciation must not exceed {maxPronunciationLength} characters");

        validator.RuleFor(expression)
            .Must(support => support is null || ItemSpeechSupportHelper.IsValidLanguageCode(support.LanguageCode))
            .WithMessage($"{fieldName}.LanguageCode must be a valid BCP-47 style language tag");
    }

    /// <summary>Adds index-range and per-entry validation rules for an indexed incorrect-answer speech map.</summary>
    internal static void AddIncorrectAnswerSpeechRules<T>(
        this AbstractValidator<T> validator,
        Expression<Func<T, Dictionary<int, ItemSpeechSupport>?>> expression,
        Func<T, int> getAnswerCount)
    {
        validator.RuleFor(expression)
            .Must((request, speechByIndex) =>
                speechByIndex is null
                || speechByIndex.Keys.All(index => index >= 0 && index < getAnswerCount(request)))
            .WithMessage("IncorrectAnswerSpeech keys must match existing incorrect answer indexes");

        validator.RuleFor(expression)
            .Must(speechByIndex =>
                speechByIndex is null
                || speechByIndex.Values.All(support =>
                    (string.IsNullOrWhiteSpace(support.Pronunciation) || support.Pronunciation.Trim().Length <= 500)
                    && ItemSpeechSupportHelper.IsValidLanguageCode(support.LanguageCode)))
            .WithMessage("IncorrectAnswerSpeech entries must use valid pronunciation lengths and language codes");
    }
}
