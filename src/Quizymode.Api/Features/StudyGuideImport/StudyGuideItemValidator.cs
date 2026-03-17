using System.Text.Json;
using Quizymode.Api.Features.Items.AddBulk;

namespace Quizymode.Api.Features.StudyGuideImport;

/// <summary>
/// Validates and maps JSON elements from AI prompt response to AddItemsBulk.ItemRequest shape.
/// </summary>
internal static class StudyGuideItemValidator
{
    public static (bool IsValid, List<string> Messages, List<AddItemsBulk.ItemRequest>? Items) ValidateAndMap(
        List<JsonElement> array,
        string categoryName,
        List<AddItemsBulk.KeywordRequest> sessionKeywords)
    {
        var messages = new List<string>();
        var items = new List<AddItemsBulk.ItemRequest>();

        for (int i = 0; i < array.Count; i++)
        {
            JsonElement el = array[i];
            if (el.ValueKind != JsonValueKind.Object)
            {
                messages.Add($"Item {i + 1}: expected an object.");
                continue;
            }

            string? question = GetString(el, "question");
            string? correctAnswer = GetString(el, "correctAnswer");
            var incorrectAnswers = GetStringArray(el, "incorrectAnswers");
            string? explanation = GetString(el, "explanation");
            string? source = GetString(el, "source");
            var keywords = GetStringArray(el, "keywords");
            decimal? factualRisk = GetDecimal(el, "factualRisk");
            string? reviewComments = GetString(el, "reviewComments");

            if (string.IsNullOrWhiteSpace(question))
                messages.Add($"Item {i + 1}: question is required.");
            else if (question.Length > 1000)
                messages.Add($"Item {i + 1}: question must not exceed 1000 characters.");

            if (string.IsNullOrWhiteSpace(correctAnswer))
                messages.Add($"Item {i + 1}: correctAnswer is required.");
            else if (correctAnswer.Length > 500)
                messages.Add($"Item {i + 1}: correctAnswer must not exceed 500 characters.");

            if (incorrectAnswers == null)
                messages.Add($"Item {i + 1}: incorrectAnswers is required.");
            else if (incorrectAnswers.Count < 1 || incorrectAnswers.Count > 4)
                messages.Add($"Item {i + 1}: incorrectAnswers must have 1 to 4 items.");
            else
            {
                foreach (string a in incorrectAnswers)
                    if (a != null && a.Length > 500)
                        messages.Add($"Item {i + 1}: each incorrect answer must not exceed 500 characters.");
            }

            if (explanation != null && explanation.Length > 4000)
                messages.Add($"Item {i + 1}: explanation must not exceed 4000 characters.");
            if (source != null && source.Length > 200)
                messages.Add($"Item {i + 1}: source must not exceed 200 characters.");
            if (factualRisk.HasValue && (factualRisk.Value < 0 || factualRisk.Value > 1))
                messages.Add($"Item {i + 1}: factualRisk must be between 0 and 1.");
            if (reviewComments != null && reviewComments.Length > 500)
                messages.Add($"Item {i + 1}: reviewComments must not exceed 500 characters.");

            if (messages.Any(m => m.StartsWith($"Item {i + 1}:")))
                continue;

            var keywordRequests = sessionKeywords.ToList();
            if (keywords != null)
                foreach (string k in keywords.Take(50))
                    if (!string.IsNullOrWhiteSpace(k) && k.Length <= 30)
                        keywordRequests.Add(new AddItemsBulk.KeywordRequest(k.Trim().ToLowerInvariant(), true));

            items.Add(new AddItemsBulk.ItemRequest(
                categoryName,
                question!.Trim(),
                correctAnswer!.Trim(),
                incorrectAnswers!.Select(a => a.Trim()).ToList(),
                explanation?.Trim() ?? "",
                keywordRequests.Count > 0 ? keywordRequests : null,
                source?.Trim(),
                factualRisk is >= 0m and <= 1m ? factualRisk : null,
                !string.IsNullOrWhiteSpace(reviewComments) ? reviewComments.Trim() : null));
        }

        bool valid = messages.Count == 0 && items.Count > 0;
        if (items.Count == 0 && array.Count > 0 && messages.Count == 0)
            messages.Add("No valid items could be parsed.");
        return (valid, messages, items.Count > 0 ? items : null);
    }

    private static string? GetString(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out var p)) return null;
        if (p.ValueKind == JsonValueKind.String) return p.GetString();
        if (p.ValueKind == JsonValueKind.Number) return p.GetDecimal().ToString();
        return null;
    }

    private static List<string>? GetStringArray(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out var p) || p.ValueKind != JsonValueKind.Array)
            return null;
        var list = new List<string>();
        foreach (var e in p.EnumerateArray())
            list.Add(e.ValueKind == JsonValueKind.String ? e.GetString() ?? "" : e.ToString());
        return list;
    }

    private static decimal? GetDecimal(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out var p)) return null;
        if (p.ValueKind == JsonValueKind.Number && p.TryGetDecimal(out decimal d)) return d;
        return null;
    }
}
