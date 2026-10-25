using System.Text;

namespace Quizymode.Api.Shared.Search;

/// <summary>
/// The user's search text split into what PostgreSQL receives as bound parameters.
/// </summary>
/// <param name="Head">Text for <c>websearch_to_tsquery</c> (quotes, <c>or</c> and <c>-exclude</c> are honoured); null when empty.</param>
/// <param name="PrefixToken">The word still being typed, matched as a prefix via <c>to_tsquery</c>; null when there is none.</param>
/// <param name="Tokens">Lowercase letter/digit runs, at most <see cref="SearchQueryParser.MaxTokens"/>.</param>
/// <param name="HasPositiveTerm">False when every token is negated or inside a negated phrase, which would otherwise match nearly every row.</param>
public sealed record ParsedSearchQuery(string? Head, string? PrefixToken, IReadOnlyList<string> Tokens, bool HasPositiveTerm)
{
    public bool IsSearchable => HasPositiveTerm && (Head is not null || PrefixToken is not null);
}

/// <summary>
/// Pure parser that turns raw input into <see cref="ParsedSearchQuery"/>. The prefix token is only ever a plain
/// <c>[letter or digit]+</c> run, so the value handed to <c>to_tsquery</c> can never carry tsquery operators.
/// </summary>
public static class SearchQueryParser
{
    public const int MaxTokens = 8;
    public const int MaxTokenLength = 40;

    public static ParsedSearchQuery Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new ParsedSearchQuery(null, null, [], false);
        }

        // Pass 1: enforce the token limits and collect runes.
        List<Rune> runes = [];
        int tokenCount = 0;
        int runLength = 0;
        bool truncated = false;
        foreach (Rune rune in raw.EnumerateRunes())
        {
            if (Rune.IsLetterOrDigit(rune))
            {
                if (runLength == 0)
                {
                    if (tokenCount == MaxTokens)
                    {
                        truncated = true;
                        break;
                    }

                    tokenCount++;
                }

                runLength++;
                if (runLength > MaxTokenLength)
                {
                    continue;
                }

                runes.Add(rune);
            }
            else
            {
                runLength = 0;
                runes.Add(rune);
            }
        }

        // Pass 2: tokens, negation, and the trailing run.
        List<string> tokens = [];
        bool hasPositive = false;
        bool inQuote = false;
        bool quoteNegated = false;
        int runStart = -1;
        for (int index = 0; index <= runes.Count; index++)
        {
            bool isWord = index < runes.Count && Rune.IsLetterOrDigit(runes[index]);
            if (isWord)
            {
                if (runStart < 0)
                {
                    runStart = index;
                }

                continue;
            }

            if (runStart >= 0)
            {
                tokens.Add(Lower(runes, runStart, index));
                bool negated = inQuote ? quoteNegated : (runStart > 0 && runes[runStart - 1].Value == '-');
                hasPositive |= !negated;
                runStart = -1;
            }

            if (index < runes.Count && runes[index].Value == '"')
            {
                inQuote = !inQuote;
                if (inQuote)
                {
                    quoteNegated = index > 0 && runes[index - 1].Value == '-';
                }
            }
        }

        if (tokens.Count == 0)
        {
            return new ParsedSearchQuery(null, null, [], false);
        }

        // Pass 3: split off the word still being typed.
        string full = RunesToString(runes, 0, runes.Count);
        string? prefix = null;
        string? head = full;
        bool endsInWord = runes.Count > 0 && Rune.IsLetterOrDigit(runes[^1]);
        if (endsInWord && !truncated)
        {
            int start = runes.Count - 1;
            while (start > 0 && Rune.IsLetterOrDigit(runes[start - 1]))
            {
                start--;
            }

            int quotes = 0;
            for (int index = 0; index < start; index++)
            {
                if (runes[index].Value == '"')
                {
                    quotes++;
                }
            }

            bool negated = start > 0 && runes[start - 1].Value == '-';
            if (quotes % 2 == 0 && !negated)
            {
                prefix = Lower(runes, start, runes.Count);
                head = RunesToString(runes, 0, start);
            }
        }

        if (string.IsNullOrWhiteSpace(head))
        {
            head = null;
        }

        return new ParsedSearchQuery(head?.Trim(), prefix, tokens, hasPositive);
    }

    /// <summary>
    /// The tsquery SQL expression for a parsed query. Only the parts that exist are included, so an absent prefix
    /// never produces an empty <c>to_tsquery</c>. Parameter names are the caller's.
    /// </summary>
    public static string BuildTsQuerySql(ParsedSearchQuery parsed, string headParameter, string prefixParameter)
    {
        if (parsed.Head is not null && parsed.PrefixToken is not null)
        {
            return $"(websearch_to_tsquery('english', {headParameter}) && to_tsquery('english', {prefixParameter}))";
        }

        if (parsed.Head is not null)
        {
            return $"websearch_to_tsquery('english', {headParameter})";
        }

        if (parsed.PrefixToken is not null)
        {
            return $"to_tsquery('english', {prefixParameter})";
        }

        throw new InvalidOperationException("A search query with no head and no prefix cannot be turned into SQL.");
    }

    /// <summary>The bound value for the prefix parameter: the token with the prefix-match operator.</summary>
    public static string ToPrefixTsQueryValue(string prefixToken) => $"{prefixToken}:*";

    private static string Lower(List<Rune> runes, int start, int end) => RunesToString(runes, start, end).ToLowerInvariant();

    private static string RunesToString(List<Rune> runes, int start, int end)
    {
        StringBuilder builder = new();
        for (int index = start; index < end; index++)
        {
            builder.Append(runes[index].ToString());
        }

        return builder.ToString();
    }
}
