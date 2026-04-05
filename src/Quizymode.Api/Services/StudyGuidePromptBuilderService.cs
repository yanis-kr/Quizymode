using System.Text;

namespace Quizymode.Api.Services;

public interface IStudyGuidePromptBuilderService
{
    string BuildChunkPrompt(
        int chunkIndex,
        int chunkCount,
        string chunkTitle,
        string chunkText,
        string categoryName,
        IReadOnlyList<string> navigationKeywordPath,
        IReadOnlyList<string>? defaultKeywords,
        IReadOnlyList<string>? previousQuestionTexts);

    string BuildDedupPrompt(IReadOnlyList<string> allQuestionTexts, string studyGuideTitle);
}

internal sealed class StudyGuidePromptBuilderService : IStudyGuidePromptBuilderService
{
    private const int MaxPreviousQuestionsBlockBytes = 2000;
    private const int MaxPreviousQuestionsCount = 40;

    private static readonly string ItemSchema = """
        Each item must be a JSON object with this shape:
        {
          "category": "science",
          "navigationKeyword1": "primary-topic",
          "navigationKeyword2": "subtopic",
          "question": "Question text (max 1000 chars)",
          "correctAnswer": "Correct answer (max 500 chars)",
          "incorrectAnswers": ["Wrong 1 (max 500 chars each)", "Wrong 2", "Wrong 3"],
          "explanation": "Short explanation, optional but recommended (max 4000 chars)",
          "source": "https://example.com/reliable-reference (max 200 chars, URL only)",
          "keywords": ["optional", "extra", "tags"],
          "factualRisk": 0.2,
          "reviewComments": "Optional note about uncertainty or assumptions (max 500 chars)"
        }
        """;

    public string BuildChunkPrompt(
        int chunkIndex,
        int chunkCount,
        string chunkTitle,
        string chunkText,
        string categoryName,
        IReadOnlyList<string> navigationKeywordPath,
        IReadOnlyList<string>? defaultKeywords,
        IReadOnlyList<string>? previousQuestionTexts)
    {
        var sb = new StringBuilder();
        string nav1 = navigationKeywordPath.Count > 0 ? navigationKeywordPath[0] : "primary-topic";
        string nav2 = navigationKeywordPath.Count > 1 ? navigationKeywordPath[1] : "subtopic";
        sb.AppendLine("You are creating new private quiz items for an app called Quizymode.");
        sb.AppendLine($"Generate 10 to 15 new quiz items from the following study guide excerpt for prompt set {chunkIndex + 1} of {chunkCount}.");
        sb.AppendLine();
        sb.AppendLine("Rules:");
        sb.AppendLine("- Category for all items: " + categoryName);
        if (navigationKeywordPath.Count > 0)
            sb.AppendLine("- Navigation path (use as context): " + string.Join(" / ", navigationKeywordPath));
        if (defaultKeywords != null && defaultKeywords.Count > 0)
            sb.AppendLine("- Default extra keywords already applied to every imported item: " + string.Join(", ", defaultKeywords));
        sb.AppendLine("- Keep the items grounded in the excerpt and avoid duplicating concepts across prompt sets.");
        sb.AppendLine("- Return ONLY a single JSON array of items. No markdown, no code fences, no commentary.");
        sb.AppendLine("- Use category = " + categoryName + " on every item.");
        sb.AppendLine("- Use navigationKeyword1 = " + nav1 + " and navigationKeyword2 = " + nav2 + " on every item.");
        sb.AppendLine("- question and correctAnswer are required. incorrectAnswers must be an array with 1 to 4 items.");
        sb.AppendLine("- If source is included, it must be a direct URL to a reliable, verifiable source. Prefer official docs, standards, government or education sites, textbooks, or other authoritative references. Do not cite the AI assistant itself.");
        sb.AppendLine("- Optional keywords are per-item extras only. Do not repeat the category, navigation keywords, or default extra keywords there.");
        sb.AppendLine("- factualRisk: number 0-1 (optional). reviewComments: string (optional).");
        sb.AppendLine();

        sb.AppendLine(ItemSchema
            .Replace("\"science\"", "\"" + categoryName + "\"")
            .Replace("\"primary-topic\"", "\"" + nav1 + "\"")
            .Replace("\"subtopic\"", "\"" + nav2 + "\""));
        sb.AppendLine();

        if (previousQuestionTexts != null && previousQuestionTexts.Count > 0 && chunkIndex > 0)
        {
            sb.AppendLine("Already generated questions (do NOT duplicate or closely repeat these):");
            var block = new StringBuilder();
            int count = 0;
            foreach (string q in previousQuestionTexts.Take(MaxPreviousQuestionsCount))
            {
                string line = "- " + q.Replace("\n", " ").Trim();
                if (line.Length > 200) line = line.Substring(0, 197) + "...";
                if (block.Length + line.Length + 2 > MaxPreviousQuestionsBlockBytes) break;
                block.AppendLine(line);
                count++;
            }
            sb.Append(block);
            sb.AppendLine();
        }
        sb.AppendLine("--- Study guide chunk (" + chunkTitle + ") ---");
        sb.AppendLine();
        sb.Append(chunkText);
        sb.AppendLine();
        sb.AppendLine("--- End chunk ---");
        sb.AppendLine();
        sb.AppendLine("Output the JSON array only.");
        return sb.ToString();
    }

    public string BuildDedupPrompt(IReadOnlyList<string> allQuestionTexts, string studyGuideTitle)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Below is a list of quiz items (questions) generated from multiple chunks of a study guide. Some may be duplicates or near-duplicates.");
        sb.AppendLine("Produce a single JSON array that merges duplicates: keep one best version of each unique concept, preserving the best explanation.");
        sb.AppendLine("Use the same JSON schema per item: category, navigationKeyword1, navigationKeyword2, question, correctAnswer, incorrectAnswers, explanation, source, keywords, factualRisk, reviewComments.");
        sb.AppendLine("Preserve category/navigationKeyword1/navigationKeyword2 exactly.");
        sb.AppendLine("Preserve or improve source so each item keeps a direct URL to a reliable, verifiable source when available; do not use the AI assistant name as the source.");
        sb.AppendLine("Return ONLY the JSON array. No markdown, no code fences, no commentary.");
        sb.AppendLine();
        sb.AppendLine("Generated questions:");
        foreach (string q in allQuestionTexts)
            sb.AppendLine("- " + q.Replace("\n", " ").Trim());
        sb.AppendLine();
        sb.AppendLine("Output the deduplicated JSON array only.");
        return sb.ToString();
    }
}
