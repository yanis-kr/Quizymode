namespace Quizymode.Api.Services.Taxonomy.Suggestions;

internal static class TopicProfileDocument
{
    /// <summary>
    /// Reduces one public item to its distinct analyzed terms. The explanation is cut to <paramref name="explanationCap"/>
    /// characters, the same cap the database projection applies, so the stored profile and the egress agree.
    /// </summary>
    public static TopicProfileItem Create(
        TopicTextAnalyzer analyzer,
        string category,
        string l1,
        string l2,
        string? question,
        string? correctAnswer,
        string? explanation,
        int explanationCap)
    {
        string capped = explanation is null || explanation.Length <= explanationCap
            ? explanation ?? string.Empty
            : explanation[..Math.Max(0, explanationCap)];

        HashSet<string> terms = new(StringComparer.Ordinal);
        foreach (string? text in new[] { question, correctAnswer, capped })
        {
            foreach (AnalyzedToken token in analyzer.Analyze(text))
            {
                terms.Add(token.Stem);
            }
        }

        return new TopicProfileItem(category, l1, l2, terms.ToList());
    }
}
