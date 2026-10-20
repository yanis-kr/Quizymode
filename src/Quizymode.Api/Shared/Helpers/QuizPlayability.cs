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
}
