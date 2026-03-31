using System.Text.Json;
using System.Text.Json.Serialization;
using Quizymode.Api.Features.Items.AddBulk;

namespace Quizymode.Api.Features.StudyGuideImport;

/// <summary>
/// Validates and maps JSON elements from AI prompt response to AddItemsBulk.ItemRequest shape.
/// Returns enriched JSON with overridden category/nav/seedId fields (seed-sync compatible).
/// </summary>
internal static class StudyGuideItemValidator
{
    private static readonly JsonSerializerOptions EnrichedJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private sealed class EnrichedItemDto
    {
        public string SeedId { get; set; } = "";
        public string Category { get; set; } = "";
        public string NavigationKeyword1 { get; set; } = "";
        public string NavigationKeyword2 { get; set; } = "";
        public string Question { get; set; } = "";
        public string CorrectAnswer { get; set; } = "";
        public List<string> IncorrectAnswers { get; set; } = [];
        public string? Explanation { get; set; }
        public string? Source { get; set; }
        public List<string>? Keywords { get; set; }
        public decimal? FactualRisk { get; set; }
        public string? ReviewComments { get; set; }
    }

    public static (bool IsValid, List<string> Messages, List<AddItemsBulk.ItemRequest>? Items, string? EnrichedJson) ValidateAndMap(
        List<JsonElement> array,
        string categoryName,
        IReadOnlyList<string> navigationKeywordPath,
        List<AddItemsBulk.KeywordRequest> sessionKeywords)
    {
        string nav1 = navigationKeywordPath.Count > 0 ? navigationKeywordPath[0] : "";
        string nav2 = navigationKeywordPath.Count > 1 ? navigationKeywordPath[1] : "";

        var messages = new List<string>();
        var items = new List<AddItemsBulk.ItemRequest>();
        var enrichedDtos = new List<EnrichedItemDto>();

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

            // Truncate oversized optional fields instead of rejecting
            if (source != null && source.Length > 200)
                source = source[..200];
            if (reviewComments != null && reviewComments.Length > 500)
                reviewComments = reviewComments[..500];

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
            if (factualRisk.HasValue && (factualRisk.Value < 0 || factualRisk.Value > 1))
                messages.Add($"Item {i + 1}: factualRisk must be between 0 and 1.");

            if (messages.Any(m => m.StartsWith($"Item {i + 1}:")))
                continue;

            // Extract seedId from AI element or generate a new one
            string seedId = GetString(el, "seedId") ?? "";
            if (!Guid.TryParse(seedId, out _))
                seedId = Guid.NewGuid().ToString();

            var keywordRequests = sessionKeywords.ToList();
            List<string>? itemKeywords = null;
            if (keywords != null)
            {
                itemKeywords = new List<string>();
                foreach (string k in keywords.Take(50))
                {
                    if (!string.IsNullOrWhiteSpace(k) && k.Length <= 30)
                    {
                        string kLower = k.Trim().ToLowerInvariant();
                        keywordRequests.Add(new AddItemsBulk.KeywordRequest(kLower, true));
                        itemKeywords.Add(kLower);
                    }
                }
                if (itemKeywords.Count == 0) itemKeywords = null;
            }

            items.Add(new AddItemsBulk.ItemRequest(
                question!.Trim(),
                correctAnswer!.Trim(),
                incorrectAnswers!.Select(a => a.Trim()).ToList(),
                explanation?.Trim() ?? "",
                keywordRequests.Count > 0 ? keywordRequests : null,
                source?.Trim()));

            // Build enriched DTO with overridden scope fields (seed-sync compatible)
            enrichedDtos.Add(new EnrichedItemDto
            {
                SeedId = seedId,
                Category = categoryName,
                NavigationKeyword1 = nav1,
                NavigationKeyword2 = nav2,
                Question = question!.Trim(),
                CorrectAnswer = correctAnswer!.Trim(),
                IncorrectAnswers = incorrectAnswers!.Select(a => a.Trim()).ToList(),
                Explanation = !string.IsNullOrWhiteSpace(explanation) ? explanation.Trim() : null,
                Source = source?.Trim(),
                Keywords = itemKeywords,
                FactualRisk = factualRisk is >= 0m and <= 1m ? factualRisk : null,
                ReviewComments = !string.IsNullOrWhiteSpace(reviewComments) ? reviewComments.Trim() : null
            });
        }

        bool valid = messages.Count == 0 && items.Count > 0;
        if (items.Count == 0 && array.Count > 0 && messages.Count == 0)
            messages.Add("No valid items could be parsed.");

        string? enrichedJson = enrichedDtos.Count > 0
            ? JsonSerializer.Serialize(enrichedDtos, EnrichedJsonOptions)
            : null;

        return (valid, messages, items.Count > 0 ? items : null, enrichedJson);
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
