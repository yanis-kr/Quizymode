using System.Text;
using System.Text.RegularExpressions;

namespace Quizymode.Api.Services;

public sealed record ChunkResult(string Title, string ChunkText, int SizeBytes);

public interface IStudyGuideChunkingService
{
    IReadOnlyList<ChunkResult> Chunk(string contentText, string? defaultTitle = null);
}

/// <summary>
/// Deterministic chunking: separators first, then paragraphs, then sentence-aware, then hard cap.
/// Target ~8–10 KB per chunk, hard max 14 KB.
/// </summary>
internal sealed class StudyGuideChunkingService : IStudyGuideChunkingService
{
    public const int TargetChunkBytes = 10_000;
    public const int SoftMaxChunkBytes = 12_000;
    public const int HardMaxChunkBytes = 14_000;

    private static readonly Regex SplitByStrongSeparators = new(
        @"(\r?\n){3,}|^---+$|^====+$|^#{1,6}\s+.+",
        RegexOptions.Multiline);

    public IReadOnlyList<ChunkResult> Chunk(string contentText, string? defaultTitle = null)
    {
        if (string.IsNullOrWhiteSpace(contentText))
            return Array.Empty<ChunkResult>();

        string normalized = Normalize(contentText);
        string[] sections = SplitByStrongSeparators.Split(normalized);
        var parts = new List<string>();
        foreach (string s in sections)
        {
            string t = s.Trim();
            if (t.Length > 0)
                parts.Add(t);
        }

        if (parts.Count == 0)
            return Array.Empty<ChunkResult>();

        var chunks = new List<ChunkResult>();
        int index = 0;
        foreach (string part in parts)
        {
            string title = InferTitle(part) ?? (defaultTitle != null ? $"{defaultTitle} (Section {index + 1})" : $"Section {index + 1}");
            IReadOnlyList<string> subChunks = SplitToSize(part, HardMaxChunkBytes);
            for (int i = 0; i < subChunks.Count; i++)
            {
                string chunkTitle = subChunks.Count > 1 ? $"{title} (Part {i + 1})" : title;
                int size = Encoding.UTF8.GetByteCount(subChunks[i]);
                chunks.Add(new ChunkResult(chunkTitle, subChunks[i], size));
            }
            index++;
        }

        return chunks;
    }

    private static string Normalize(string text)
    {
        return text
            .Replace("\r\n", "\n")
            .Replace("\r", "\n")
            .Trim();
    }

    private static string? InferTitle(string section)
    {
        var firstLine = section.Split('\n').FirstOrDefault(l => l.Trim().Length > 0);
        if (string.IsNullOrEmpty(firstLine)) return null;
        firstLine = firstLine.Trim();
        var headingMatch = Regex.Match(firstLine, @"^#{1,6}\s+(.+)$");
        if (headingMatch.Success)
            return headingMatch.Groups[1].Value.Trim();
        if (firstLine.Length <= 80 && !firstLine.Contains('\n'))
            return firstLine;
        return null;
    }

    private static IReadOnlyList<string> SplitToSize(string text, int maxBytes)
    {
        int byteCount = Encoding.UTF8.GetByteCount(text);
        if (byteCount <= maxBytes)
            return new[] { text };

        var result = new List<string>();
        var paragraphs = text.Split(new[] { "\n\n" }, StringSplitOptions.None);
        var current = new StringBuilder();
        int currentBytes = 0;

        foreach (string para in paragraphs)
        {
            int paraBytes = Encoding.UTF8.GetByteCount(para);
            if (paraBytes > maxBytes)
            {
                if (current.Length > 0)
                {
                    result.Add(current.ToString());
                    current.Clear();
                    currentBytes = 0;
                }
                foreach (string sentence in SplitBySentences(para))
                {
                    int sentBytes = Encoding.UTF8.GetByteCount(sentence);
                    if (currentBytes + sentBytes > maxBytes && current.Length > 0)
                    {
                        result.Add(current.ToString());
                        current.Clear();
                        currentBytes = 0;
                    }
                    current.Append(sentence);
                    currentBytes += sentBytes;
                }
                continue;
            }

            if (currentBytes + paraBytes + 2 > maxBytes && current.Length > 0)
            {
                result.Add(current.ToString());
                current.Clear();
                currentBytes = 0;
            }
            if (current.Length > 0) current.Append("\n\n");
            current.Append(para);
            currentBytes = Encoding.UTF8.GetByteCount(current.ToString());
        }

        if (current.Length > 0)
            result.Add(current.ToString());
        return result;
    }

    private static IEnumerable<string> SplitBySentences(string paragraph)
    {
        var parts = Regex.Split(paragraph, @"(?<=[.!?])\s+");
        foreach (string p in parts)
        {
            if (p.Trim().Length > 0)
                yield return p.TrimEnd() + " ";
        }
    }
}
