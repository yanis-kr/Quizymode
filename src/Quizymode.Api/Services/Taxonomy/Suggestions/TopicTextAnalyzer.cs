using Quizymode.Api.Shared.Taxonomy;
using Quizymode.Api.Shared.Text;

namespace Quizymode.Api.Services.Taxonomy.Suggestions;

/// <param name="Surface">The lowercased word as it appeared in the input (an alias expansion keeps the source word).</param>
/// <param name="Stem">The term that is indexed and scored.</param>
internal readonly record struct AnalyzedToken(string Surface, string Stem);

/// <summary>
/// Turns free text into scoring terms: tokenize, drop stop words and noise, expand aliases, stem. The same instance
/// shape is used for the taxonomy text, the item profiles and the query, so all three agree on the terms.
/// </summary>
internal sealed class TopicTextAnalyzer(bool useStemmer = true)
{
    /// <summary>
    /// Aliases whose key is two letters read as ordinary words when lowercase (<c>os</c>, <c>ci</c>, <c>db</c>), so they
    /// expand only when the author typed them in capitals (<c>OS</c>, <c>CI</c>).
    /// </summary>
    private const int ShortAliasLength = 2;

    public IReadOnlyList<AnalyzedToken> Analyze(string? text, bool trustedText = false)
    {
        List<AnalyzedToken> result = [];
        if (string.IsNullOrWhiteSpace(text))
        {
            return result;
        }

        int start = -1;
        for (int index = 0; index <= text.Length; index++)
        {
            bool isWordChar = index < text.Length && char.IsLetterOrDigit(text[index]);
            if (isWordChar)
            {
                if (start < 0)
                {
                    start = index;
                }

                continue;
            }

            if (start >= 0)
            {
                AddToken(result, text.AsSpan(start, index - start).ToString(), trustedText);
                start = -1;
            }
        }

        return result;
    }

    private void AddToken(List<AnalyzedToken> result, string original, bool trustedText)
    {
        string token = original.ToLowerInvariant();
        IReadOnlyList<string> expansion = TaxonomySearchAliases.Expand(token);
        bool isAlias = expansion.Count > 0;

        if (token.Length < ShortAliasLength
            || (token.Length == ShortAliasLength && !isAlias && !token.Any(char.IsDigit)))
        {
            return;
        }

        if (EnglishStopWords.Contains(token))
        {
            return;
        }

        result.Add(new AnalyzedToken(token, StemOf(token)));

        if (!isAlias)
        {
            return;
        }

        bool expand = trustedText || token.Length > ShortAliasLength || IsUpperCase(original);
        if (!expand)
        {
            return;
        }

        foreach (string word in expansion)
        {
            if (!EnglishStopWords.Contains(word))
            {
                result.Add(new AnalyzedToken(token, StemOf(word)));
            }
        }
    }

    private string StemOf(string word) => useStemmer ? EnglishStemmer.Stem(word) : word;

    private static bool IsUpperCase(string word) => word.Any(char.IsLetter) && !word.Any(char.IsLower);
}
