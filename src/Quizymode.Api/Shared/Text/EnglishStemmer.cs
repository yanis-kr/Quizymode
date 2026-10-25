namespace Quizymode.Api.Shared.Text;

/// <summary>
/// A deliberately light English stemmer (plural, -ing, -ed, -ly and a trailing silent e) so "networks", "network",
/// "networking" and "networked" share one term. It is not Porter2: it only needs to be consistent between the
/// indexed text and the query. Tokens that contain digits (<c>s3</c>, <c>ec2</c>) are never changed.
/// </summary>
internal static class EnglishStemmer
{
    public static string Stem(string token)
    {
        if (token.Length <= 3 || token.Any(char.IsDigit))
        {
            return token;
        }

        string word = token;
        word = StripPlural(word);
        word = StripSuffix(word, "ing", minRemaining: 3);
        word = StripSuffix(word, "ed", minRemaining: 3);
        word = StripSuffix(word, "ly", minRemaining: 4);

        if (word.Length > 4 && word[^1] == 'e')
        {
            word = word[..^1];
        }

        // "running" -> "runn" -> "run"; keep the doubled l, s and z of "call", "pass" and "buzz".
        if (word.Length > 3 && word[^1] == word[^2] && word[^1] is not ('l' or 's' or 'z') && !IsVowel(word[^1]))
        {
            word = word[..^1];
        }

        return word;
    }

    private static string StripPlural(string word)
    {
        if (word.Length > 4 && word.EndsWith("ies", StringComparison.Ordinal))
        {
            return word[..^3] + "y";
        }

        if (word.EndsWith("sses", StringComparison.Ordinal))
        {
            return word[..^2];
        }

        if (word.Length > 4
            && (word.EndsWith("xes", StringComparison.Ordinal)
                || word.EndsWith("ches", StringComparison.Ordinal)
                || word.EndsWith("shes", StringComparison.Ordinal)))
        {
            return word[..^2];
        }

        if (word.Length > 3
            && word[^1] == 's'
            && !word.EndsWith("ss", StringComparison.Ordinal)
            && !word.EndsWith("us", StringComparison.Ordinal)
            && !word.EndsWith("is", StringComparison.Ordinal))
        {
            return word[..^1];
        }

        return word;
    }

    private static string StripSuffix(string word, string suffix, int minRemaining)
    {
        if (!word.EndsWith(suffix, StringComparison.Ordinal))
        {
            return word;
        }

        string rest = word[..^suffix.Length];
        return rest.Length >= minRemaining && rest.Any(IsVowel) ? rest : word;
    }

    private static bool IsVowel(char c) => c is 'a' or 'e' or 'i' or 'o' or 'u' or 'y';
}
