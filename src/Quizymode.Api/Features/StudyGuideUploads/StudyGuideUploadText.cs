using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>Size limit, normalization, and hashing for pasted study guide text.</summary>
internal static partial class StudyGuideUploadText
{
    /// <summary>Maximum UTF-8 size of the pasted text (10 KB).</summary>
    public const int MaxTextBytes = 10 * 1024;

    public static int GetByteCount(string? text) => text is null ? 0 : Encoding.UTF8.GetByteCount(text);

    /// <summary>
    /// Normalizes text for duplicate detection: Unicode NFC, whitespace runs collapsed to one space, trimmed, lowercased.
    /// Reformatting or re-pasting the same guide therefore produces the same hash.
    /// </summary>
    public static string Normalize(string text)
    {
        string composed = text.Normalize(NormalizationForm.FormC);
        return WhitespaceRegex().Replace(composed, " ").Trim().ToLowerInvariant();
    }

    /// <summary>Lowercase hex SHA-256 of <see cref="Normalize"/>(text).</summary>
    public static string ComputeHash(string text)
    {
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(Normalize(text)));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}
