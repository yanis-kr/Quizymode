using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Quizymode.Api.Features.StudyGuideDocuments.Extraction;

/// <summary>Normalization and hashing for study guide text (duplicate detection).</summary>
internal static partial class StudyGuideTextHash
{
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
