namespace Quizymode.Api.Features.Games.GetRoster;

/// <summary>
/// SQL form of the Games item rules (AC 3.20.2, 3.20.25): a looser server prefilter whose result the client still
/// re-checks. Trimming matches JavaScript <c>String.prototype.trim</c>; lengths are code points, like the client.
/// </summary>
internal static class GameRosterEligibility
{
    private const int MaxQuestionChars = 80;
    private const int MaxAnswerChars = 25;
    private const int MaxGroupLabelChars = 30;

    // JavaScript trim() whitespace beyond ASCII: NBSP, Ogham space, U+2000-U+200A, line/paragraph separators,
    // NNBSP, MMSP, ideographic space and the BOM.
    private static readonly int[] ExtraTrimCodePoints =
        [160, 5760, .. Enumerable.Range(8192, 11), 8232, 8233, 8239, 8287, 12288, 65279];

    private static readonly string TrimSet =
        "E' \\t\\n\\r\\f\\v'" + string.Concat(ExtraTrimCodePoints.Select(codePoint => $" || chr({codePoint})"));

    private static string Trimmed(string column) => $"btrim({column}, {TrimSet})";

    private static string Within(string column, int max) =>
        $"char_length({Trimmed(column)}) BETWEEN 1 AND {max}";

    /// <summary>
    /// Items that suit a question game (short question, short answer, a distinct short distractor) or Sort It
    /// (a group label plus a short answer). Selects every Items column so EF can compose over it.
    /// </summary>
    public static readonly string Sql =
        "SELECT i.* FROM \"Items\" AS i WHERE (" +
        $"{Within("i.\"Question\"", MaxQuestionChars)} AND {Within("i.\"CorrectAnswer\"", MaxAnswerChars)} AND EXISTS (" +
        "SELECT 1 FROM jsonb_array_elements_text(i.\"IncorrectAnswers\") AS d(v) WHERE " +
        $"{Within("d.v", MaxAnswerChars)} AND lower({Trimmed("d.v")}) <> lower({Trimmed("i.\"CorrectAnswer\"")}))" +
        ") OR (" +
        $"{Within("i.\"GroupLabel\"", MaxGroupLabelChars)} AND {Within("i.\"CorrectAnswer\"", MaxAnswerChars)}" +
        ")";
}
