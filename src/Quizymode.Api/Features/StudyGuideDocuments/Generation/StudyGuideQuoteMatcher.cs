using System.Text;
using System.Text.RegularExpressions;

namespace Quizymode.Api.Features.StudyGuideDocuments.Generation;

/// <summary>
/// Source-quote check (AC 6.6): a generated question is kept only when its <c>sourceQuote</c>, normalized, is at least
/// <see cref="MinQuoteLength"/> characters and occurs in the normalized section text. Both sides are normalized the same
/// way: Unicode NFC, lowercase, curly quotes/apostrophes and dashes unified, soft hyphens and line-break hyphenation
/// removed, whitespace collapsed, and leading/trailing ellipses and quote marks stripped.
/// </summary>
internal static partial class StudyGuideQuoteMatcher
{
    public const int MinQuoteLength = 15;

    public static string Normalize(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return string.Empty;
        }

        StringBuilder builder = new(text.Length);
        foreach (char character in text.Normalize(NormalizationForm.FormC).ToLowerInvariant())
        {
            switch (character)
            {
                case '­':
                    break;
                case '‘' or '’' or '‚' or '‛' or '′' or '`' or '´':
                    builder.Append('\'');
                    break;
                case '“' or '”' or '„' or '‟' or '″' or '«' or '»':
                    builder.Append('"');
                    break;
                case '‐' or '‑' or '‒' or '–' or '—' or '―' or '−':
                    builder.Append('-');
                    break;
                case '…':
                    builder.Append("...");
                    break;
                default:
                    builder.Append(char.IsWhiteSpace(character) ? ' ' : character);
                    break;
            }
        }

        string collapsed = WhitespaceRegex().Replace(builder.ToString(), " ").Trim();
        string dehyphenated = LineBreakHyphenRegex().Replace(collapsed, "$1$2");
        return StripEdges(dehyphenated);
    }

    /// <summary>True when <paramref name="quote"/> is long enough and found in <paramref name="normalizedSource"/>.</summary>
    public static bool IsSupported(string? quote, string normalizedSource)
    {
        string normalizedQuote = Normalize(quote);
        return normalizedQuote.Length >= MinQuoteLength &&
               normalizedSource.Contains(normalizedQuote, StringComparison.Ordinal);
    }

    private static string StripEdges(string value)
    {
        string current = value;
        while (true)
        {
            string next = current.Trim();
            if (next.StartsWith("...", StringComparison.Ordinal))
            {
                next = next[3..];
            }

            if (next.EndsWith("...", StringComparison.Ordinal))
            {
                next = next[..^3];
            }

            next = next.Trim().Trim('"', '\'').Trim();
            if (next == current)
            {
                return next;
            }

            current = next;
        }
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();

    [GeneratedRegex(@"(\p{L})- (\p{L})")]
    private static partial Regex LineBreakHyphenRegex();
}
