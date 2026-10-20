using FluentValidation;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Shared rules for quiz-playable items (#250). Mirrors <c>getQuizDistractors</c> in the web app's quizRun.ts:
/// an item is playable when at least one incorrect answer remains after trimming, dropping blanks, dropping
/// case-insensitive duplicates and dropping values equal to the correct answer.
/// </summary>
internal static class QuizPlayability
{
    internal const string IncorrectAnswersCountMessage = "Provide 1 to 4 incorrect answers.";
    internal const string IncorrectAnswerBlankMessage = "Incorrect answers cannot be blank.";
    internal const string IncorrectAnswerMatchesCorrectMessage = "Incorrect answers must be different from the correct answer.";
    internal const string DuplicateIncorrectAnswersMessage = "Incorrect answers must be different from each other.";

    internal static List<string> GetDistractors(string? correctAnswer, IEnumerable<string>? incorrectAnswers)
    {
        List<string> result = [];
        if (incorrectAnswers is null) return result;
        string correct = (correctAnswer ?? string.Empty).Trim();
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        foreach (string? raw in incorrectAnswers)
        {
            string value = (raw ?? string.Empty).Trim();
            if (value.Length == 0) continue;
            if (string.Equals(value, correct, StringComparison.OrdinalIgnoreCase)) continue;
            if (seen.Add(value)) result.Add(value);
        }
        return result;
    }

    /// <summary>
    /// Returns the message for the first conflict (an incorrect answer equal to the correct answer, then duplicate
    /// incorrect answers) using the same normalization as <see cref="GetDistractors"/>, or null when there is none.
    /// A null list or a blank correct answer is not a conflict.
    /// </summary>
    internal static string? GetIncorrectAnswerConflict(string? correctAnswer, IEnumerable<string?>? incorrectAnswers)
    {
        if (incorrectAnswers is null) return null;
        string correct = (correctAnswer ?? string.Empty).Trim();
        bool matchesCorrect = false;
        bool hasDuplicate = false;
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        foreach (string? raw in incorrectAnswers)
        {
            string value = (raw ?? string.Empty).Trim();
            if (value.Length == 0) continue;
            if (correct.Length > 0 && string.Equals(value, correct, StringComparison.OrdinalIgnoreCase))
            {
                matchesCorrect = true;
            }
            if (!seen.Add(value)) hasDuplicate = true;
        }
        if (matchesCorrect) return IncorrectAnswerMatchesCorrectMessage;
        return hasDuplicate ? DuplicateIncorrectAnswersMessage : null;
    }

    internal static bool IsPlayable(string? correctAnswer, IEnumerable<string>? incorrectAnswers) =>
        GetDistractors(correctAnswer, incorrectAnswers).Count > 0;

    /// <summary>Requires 1 to 4 incorrect answers, none blank or whitespace-only.</summary>
    internal static IRuleBuilderOptions<T, List<string>> MustHaveOneToFourNonBlank<T>(
        this IRuleBuilder<T, List<string>> rule) =>
        rule
            .Must(answers => answers is null || (answers.Count >= 1 && answers.Count <= 4))
            .WithMessage(IncorrectAnswersCountMessage)
            .Must(answers => answers is null || answers.All(a => !string.IsNullOrWhiteSpace(a)))
            .WithMessage(IncorrectAnswerBlankMessage);

    /// <summary>Rejects incorrect answers equal to the correct answer or to each other (blanks skipped, #276).</summary>
    internal static IRuleBuilderOptions<T, List<string>> MustHaveDistinctIncorrectAnswers<T>(
        this IRuleBuilder<T, List<string>> rule, Func<T, string?> correctAnswer) =>
        rule
            .Must((request, answers) => GetIncorrectAnswerConflict(correctAnswer(request), answers) != IncorrectAnswerMatchesCorrectMessage)
            .WithMessage(IncorrectAnswerMatchesCorrectMessage)
            .Must((request, answers) => GetIncorrectAnswerConflict(correctAnswer(request), answers) != DuplicateIncorrectAnswersMessage)
            .WithMessage(DuplicateIncorrectAnswersMessage);
}
