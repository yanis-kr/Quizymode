using System.Text.Json;
using System.Text.Json.Serialization;
using Quizymode.Api.Features.Items.AddBulk;

namespace Quizymode.Api.Features.StudyGuideImport;

/// <summary>
/// Validates and maps JSON elements from AI prompt responses to the bulk item-create shape.
/// Returns enriched JSON with overridden category and navigation fields for review/debugging.
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

        List<string> messages = [];
        List<AddItemsBulk.ItemRequest> items = [];
        List<EnrichedItemDto> enrichedDtos = [];

        for (int index = 0; index < array.Count; index++)
        {
            JsonElement element = array[index];
            if (element.ValueKind != JsonValueKind.Object)
            {
                messages.Add($"Item {index + 1}: expected an object.");
                continue;
            }

            string? question = GetString(element, "question");
            string? correctAnswer = GetString(element, "correctAnswer");
            List<string>? incorrectAnswers = GetStringArray(element, "incorrectAnswers");
            string? explanation = GetString(element, "explanation");
            string? source = GetString(element, "source");
            List<string>? keywords = GetStringArray(element, "keywords");
            decimal? factualRisk = GetDecimal(element, "factualRisk");
            string? reviewComments = GetString(element, "reviewComments");

            if (source is not null && source.Length > 200)
            {
                source = source[..200];
            }

            if (reviewComments is not null && reviewComments.Length > 500)
            {
                reviewComments = reviewComments[..500];
            }

            if (string.IsNullOrWhiteSpace(question))
            {
                messages.Add($"Item {index + 1}: question is required.");
            }
            else if (question.Length > 1000)
            {
                messages.Add($"Item {index + 1}: question must not exceed 1000 characters.");
            }

            if (string.IsNullOrWhiteSpace(correctAnswer))
            {
                messages.Add($"Item {index + 1}: correctAnswer is required.");
            }
            else if (correctAnswer.Length > 500)
            {
                messages.Add($"Item {index + 1}: correctAnswer must not exceed 500 characters.");
            }

            if (incorrectAnswers is null)
            {
                messages.Add($"Item {index + 1}: incorrectAnswers is required.");
            }
            else if (incorrectAnswers.Count < 1 || incorrectAnswers.Count > 4)
            {
                messages.Add($"Item {index + 1}: incorrectAnswers must have 1 to 4 items.");
            }
            else if (incorrectAnswers.Any(answer => answer.Length > 500))
            {
                messages.Add($"Item {index + 1}: each incorrect answer must not exceed 500 characters.");
            }

            if (explanation is not null && explanation.Length > 4000)
            {
                messages.Add($"Item {index + 1}: explanation must not exceed 4000 characters.");
            }

            if (factualRisk.HasValue && (factualRisk.Value < 0 || factualRisk.Value > 1))
            {
                messages.Add($"Item {index + 1}: factualRisk must be between 0 and 1.");
            }

            if (messages.Any(message => message.StartsWith($"Item {index + 1}:", StringComparison.Ordinal)))
            {
                continue;
            }

            List<string> trimmedIncorrectAnswers = incorrectAnswers!
                .Select(answer => answer.Trim())
                .ToList();

            List<AddItemsBulk.KeywordRequest> keywordRequests = sessionKeywords.ToList();
            List<string>? itemKeywords = null;
            if (keywords is not null)
            {
                itemKeywords = [];
                foreach (string keyword in keywords.Take(50))
                {
                    if (string.IsNullOrWhiteSpace(keyword) || keyword.Length > 30)
                    {
                        continue;
                    }

                    string normalizedKeyword = keyword.Trim().ToLowerInvariant();
                    keywordRequests.Add(new AddItemsBulk.KeywordRequest(normalizedKeyword, true));
                    itemKeywords.Add(normalizedKeyword);
                }

                if (itemKeywords.Count == 0)
                {
                    itemKeywords = null;
                }
            }

            items.Add(new AddItemsBulk.ItemRequest(
                question!.Trim(),
                correctAnswer!.Trim(),
                trimmedIncorrectAnswers,
                explanation?.Trim() ?? string.Empty,
                keywordRequests.Count > 0 ? keywordRequests : null,
                source?.Trim()));

            enrichedDtos.Add(new EnrichedItemDto
            {
                Category = categoryName,
                NavigationKeyword1 = nav1,
                NavigationKeyword2 = nav2,
                Question = question.Trim(),
                CorrectAnswer = correctAnswer.Trim(),
                IncorrectAnswers = trimmedIncorrectAnswers,
                Explanation = !string.IsNullOrWhiteSpace(explanation) ? explanation.Trim() : null,
                Source = source?.Trim(),
                Keywords = itemKeywords,
                FactualRisk = factualRisk is >= 0m and <= 1m ? factualRisk : null,
                ReviewComments = !string.IsNullOrWhiteSpace(reviewComments) ? reviewComments.Trim() : null
            });
        }

        bool isValid = messages.Count == 0 && items.Count > 0;
        if (items.Count == 0 && array.Count > 0 && messages.Count == 0)
        {
            messages.Add("No valid items could be parsed.");
        }

        string? enrichedJson = enrichedDtos.Count > 0
            ? JsonSerializer.Serialize(enrichedDtos, EnrichedJsonOptions)
            : null;

        return (isValid, messages, items.Count > 0 ? items : null, enrichedJson);
    }

    private static string? GetString(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out JsonElement property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.String)
        {
            return property.GetString();
        }

        if (property.ValueKind == JsonValueKind.Number)
        {
            return property.GetDecimal().ToString();
        }

        return null;
    }

    private static List<string>? GetStringArray(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out JsonElement property) || property.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        List<string> list = [];
        foreach (JsonElement element in property.EnumerateArray())
        {
            list.Add(element.ValueKind == JsonValueKind.String ? element.GetString() ?? string.Empty : element.ToString());
        }

        return list;
    }

    private static decimal? GetDecimal(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out JsonElement property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetDecimal(out decimal value))
        {
            return value;
        }

        return null;
    }
}
