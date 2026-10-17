using System.Text.Json;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Features.StudyGuideImport;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>A validated AI-generated question awaiting the owner's review.</summary>
public sealed record StudyGuideGeneratedQuestion(
    string Question,
    string CorrectAnswer,
    List<string> IncorrectAnswers,
    string? Explanation);

/// <summary>
/// Strictly validates the model reply: valid JSON, either <c>{"questions":[...]}</c> or a bare array, 1..max items, and
/// every item must pass the same per-item rules as the manual study guide import (<see cref="StudyGuideItemValidator"/>).
/// Any violation fails the whole upload rather than silently keeping a partial set.
/// </summary>
internal static class StudyGuideQuestionParser
{
    public static Result<List<StudyGuideGeneratedQuestion>> Parse(
        string rawText,
        string categoryName,
        string navigationKeyword1,
        string navigationKeyword2,
        int maxQuestions)
    {
        List<JsonElement> elements;
        try
        {
            using JsonDocument document = JsonDocument.Parse(StripCodeFence(rawText));
            JsonElement root = document.RootElement;
            JsonElement array = root;
            if (root.ValueKind == JsonValueKind.Object)
            {
                if (!root.TryGetProperty("questions", out array))
                {
                    return Invalid("The generated response did not contain a questions list.");
                }
            }

            if (array.ValueKind != JsonValueKind.Array)
            {
                return Invalid("The generated response did not contain a questions list.");
            }

            elements = array.EnumerateArray().Select(element => element.Clone()).ToList();
        }
        catch (JsonException)
        {
            return Invalid("The generated response was not valid JSON.");
        }

        if (elements.Count == 0)
        {
            return Invalid("No questions could be generated from this study guide.");
        }

        if (elements.Count > maxQuestions)
        {
            return Invalid($"The generator returned {elements.Count} questions; the maximum is {maxQuestions}.");
        }

        (bool isValid, List<string> messages, List<AddItemsBulk.ItemRequest>? items, _) = StudyGuideItemValidator.ValidateAndMap(
            elements,
            categoryName,
            [navigationKeyword1, navigationKeyword2],
            []);

        if (!isValid || items is null || items.Count != elements.Count)
        {
            string detail = messages.Count > 0 ? string.Join(" ", messages.Take(3)) : "Generated questions were invalid.";
            return Invalid($"Generated questions failed validation. {detail}");
        }

        List<StudyGuideGeneratedQuestion> questions = items
            .Select(item => new StudyGuideGeneratedQuestion(
                item.Question,
                item.CorrectAnswer,
                item.IncorrectAnswers,
                string.IsNullOrWhiteSpace(item.Explanation) ? null : item.Explanation))
            .ToList();

        int distinctCount = questions
            .Select(question => question.Question.Trim().ToLowerInvariant())
            .Distinct(StringComparer.Ordinal)
            .Count();
        if (distinctCount != questions.Count)
        {
            return Invalid("Generated questions contained duplicates.");
        }

        return Result.Success(questions);
    }

    /// <summary>True when any generated string contains blocked language (profanity check on model output).</summary>
    public static bool IsBlocked(ITextModerationService moderation, IEnumerable<StudyGuideGeneratedQuestion> questions)
    {
        foreach (StudyGuideGeneratedQuestion question in questions)
        {
            List<string?> values = [question.Question, question.CorrectAnswer, question.Explanation];
            values.AddRange(question.IncorrectAnswers);
            if (moderation.Evaluate(values.ToArray()).Outcome == TextModerationOutcome.Blocked)
            {
                return true;
            }
        }

        return false;
    }

    private static string StripCodeFence(string text)
    {
        string trimmed = text.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        int firstNewline = trimmed.IndexOf('\n');
        int lastFence = trimmed.LastIndexOf("```", StringComparison.Ordinal);
        if (firstNewline < 0 || lastFence <= firstNewline)
        {
            return trimmed;
        }

        return trimmed[(firstNewline + 1)..lastFence].Trim();
    }

    private static Result<List<StudyGuideGeneratedQuestion>> Invalid(string message) =>
        Result.Failure<List<StudyGuideGeneratedQuestion>>(Error.Validation("StudyGuideUpload.InvalidGeneration", message));
}
