using System.Text;
using System.Text.RegularExpressions;

namespace Quizymode.Api.Services;

public sealed record ChunkResult(string Title, string ChunkText, int SizeBytes);

public interface IStudyGuideChunkingService
{
    IReadOnlyList<ChunkResult> Chunk(
        string contentText,
        string? defaultTitle = null,
        int? targetChunkCount = null);
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
    private const int MinTargetChunkCount = 1;
    private const int MaxTargetChunkCount = 6;

    private static readonly Regex SplitByStrongSeparators = new(
        @"(\r?\n){3,}|^---+$|^====+$|^#{1,6}\s+.+",
        RegexOptions.Multiline);

    private sealed record Segment(string Title, string Text, int SizeBytes);

    public IReadOnlyList<ChunkResult> Chunk(
        string contentText,
        string? defaultTitle = null,
        int? targetChunkCount = null)
    {
        if (string.IsNullOrWhiteSpace(contentText))
            return Array.Empty<ChunkResult>();

        string normalized = Normalize(contentText);
        List<string> parts = GetParts(normalized);
        if (parts.Count == 0)
            return Array.Empty<ChunkResult>();

        int? normalizedTargetChunkCount = targetChunkCount.HasValue
            ? Math.Clamp(targetChunkCount.Value, MinTargetChunkCount, MaxTargetChunkCount)
            : null;

        if (normalizedTargetChunkCount.HasValue)
            return ChunkToTargetCount(parts, normalizedTargetChunkCount.Value, defaultTitle);

        return ChunkBySize(parts, defaultTitle);
    }

    private static IReadOnlyList<ChunkResult> ChunkBySize(
        IReadOnlyList<string> parts,
        string? defaultTitle)
    {
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

    private static IReadOnlyList<ChunkResult> ChunkToTargetCount(
        IReadOnlyList<string> parts,
        int targetChunkCount,
        string? defaultTitle)
    {
        var segments = BuildAtomicSegments(parts, defaultTitle);
        if (segments.Count == 0)
            return Array.Empty<ChunkResult>();

        while (segments.Count < targetChunkCount)
        {
            int largestIndex = FindLargestSegmentIndex(segments);
            List<Segment>? split = SplitSegmentFurther(segments[largestIndex]);
            if (split == null || split.Count < 2)
                break;

            segments.RemoveAt(largestIndex);
            segments.InsertRange(largestIndex, split);
        }

        int effectiveChunkCount = Math.Min(targetChunkCount, segments.Count);
        if (effectiveChunkCount <= 1)
        {
            string combinedText = string.Join("\n\n---\n\n", segments.Select(s => s.Text));
            string combinedTitle =
                defaultTitle?.Trim() ??
                segments.Select(s => s.Title).FirstOrDefault(t => !string.IsNullOrWhiteSpace(t)) ??
                "Study guide";
            return new[]
            {
                new ChunkResult(combinedTitle, combinedText, Encoding.UTF8.GetByteCount(combinedText))
            };
        }

        int totalBytes = segments.Sum(s => s.SizeBytes);
        int remainingBytes = totalBytes;
        int cursor = 0;
        var chunks = new List<ChunkResult>();

        for (int chunkIndex = 0; chunkIndex < effectiveChunkCount; chunkIndex++)
        {
            int chunksLeft = effectiveChunkCount - chunkIndex;
            int targetBytesForChunk = Math.Max(1, remainingBytes / chunksLeft);
            var group = new List<Segment>();
            int groupBytes = 0;

            while (cursor < segments.Count)
            {
                int segmentsLeft = segments.Count - cursor;
                if (chunkIndex < effectiveChunkCount - 1 && group.Count > 0 && segmentsLeft == chunksLeft)
                    break;
                if (chunkIndex < effectiveChunkCount - 1 && group.Count > 0 && groupBytes >= targetBytesForChunk)
                    break;

                Segment next = segments[cursor];
                group.Add(next);
                groupBytes += next.SizeBytes;
                cursor++;

                if (chunkIndex == effectiveChunkCount - 1)
                    continue;
            }

            if (group.Count == 0 && cursor < segments.Count)
            {
                Segment fallback = segments[cursor];
                group.Add(fallback);
                groupBytes += fallback.SizeBytes;
                cursor++;
            }

            string baseTitle =
                defaultTitle?.Trim() ??
                group.Select(s => s.Title).FirstOrDefault(t => !string.IsNullOrWhiteSpace(t)) ??
                "Study guide";
            string chunkTitle = $"{baseTitle} (Set {chunkIndex + 1} of {effectiveChunkCount})";
            string chunkText = string.Join("\n\n---\n\n", group.Select(s => s.Text));
            int sizeBytes = Encoding.UTF8.GetByteCount(chunkText);
            chunks.Add(new ChunkResult(chunkTitle, chunkText, sizeBytes));
            remainingBytes -= groupBytes;
        }

        return chunks;
    }

    private static List<Segment> BuildAtomicSegments(
        IReadOnlyList<string> parts,
        string? defaultTitle)
    {
        var segments = new List<Segment>();
        int index = 0;
        foreach (string part in parts)
        {
            string title = InferTitle(part) ?? (defaultTitle != null ? $"{defaultTitle} (Section {index + 1})" : $"Section {index + 1}");
            foreach (string subChunk in SplitToSize(part, TargetChunkBytes))
            {
                string text = subChunk.Trim();
                if (string.IsNullOrWhiteSpace(text))
                    continue;
                segments.Add(new Segment(title, text, Encoding.UTF8.GetByteCount(text)));
            }

            index++;
        }

        return segments;
    }

    private static int FindLargestSegmentIndex(IReadOnlyList<Segment> segments)
    {
        int bestIndex = 0;
        int bestBytes = segments[0].SizeBytes;
        for (int i = 1; i < segments.Count; i++)
        {
            if (segments[i].SizeBytes <= bestBytes)
                continue;
            bestBytes = segments[i].SizeBytes;
            bestIndex = i;
        }

        return bestIndex;
    }

    private static List<Segment>? SplitSegmentFurther(Segment segment)
    {
        List<string> paragraphs = segment.Text
            .Split(new[] { "\n\n" }, StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .ToList();
        if (paragraphs.Count >= 2)
            return BuildSplitSegments(segment.Title, paragraphs);

        List<string> sentences = SplitBySentences(segment.Text)
            .Select(s => s.Trim())
            .Where(s => s.Length > 0)
            .ToList();
        if (sentences.Count >= 2)
            return BuildSplitSegments(segment.Title, sentences);

        string text = segment.Text.Trim();
        if (text.Length < 400)
            return null;

        int midpoint = text.Length / 2;
        int splitIndex = text.LastIndexOf(' ', midpoint);
        if (splitIndex < text.Length / 4)
            splitIndex = text.IndexOf(' ', midpoint);
        if (splitIndex <= 0 || splitIndex >= text.Length - 1)
            return null;

        string first = text[..splitIndex].Trim();
        string second = text[(splitIndex + 1)..].Trim();
        if (string.IsNullOrWhiteSpace(first) || string.IsNullOrWhiteSpace(second))
            return null;

        return new List<Segment>
        {
            new(segment.Title, first, Encoding.UTF8.GetByteCount(first)),
            new(segment.Title, second, Encoding.UTF8.GetByteCount(second))
        };
    }

    private static List<Segment> BuildSplitSegments(string title, IReadOnlyList<string> pieces)
    {
        int totalBytes = pieces.Sum(Encoding.UTF8.GetByteCount);
        int targetBytes = Math.Max(1, totalBytes / 2);
        var first = new List<string>();
        var second = new List<string>();
        int firstBytes = 0;

        foreach (string piece in pieces)
        {
            int pieceBytes = Encoding.UTF8.GetByteCount(piece);
            if (first.Count == 0 || firstBytes + pieceBytes <= targetBytes || second.Count == 0)
            {
                first.Add(piece);
                firstBytes += pieceBytes;
            }
            else
            {
                second.Add(piece);
            }
        }

        if (second.Count == 0 && first.Count > 1)
        {
            second.Add(first[^1]);
            first.RemoveAt(first.Count - 1);
        }

        string separator = pieces.Any(p => p.Contains('\n')) ? "\n\n" : " ";
        string firstText = string.Join(separator, first).Trim();
        string secondText = string.Join(separator, second).Trim();

        if (string.IsNullOrWhiteSpace(firstText) || string.IsNullOrWhiteSpace(secondText))
            return new List<Segment>();

        return new List<Segment>
        {
            new(title, firstText, Encoding.UTF8.GetByteCount(firstText)),
            new(title, secondText, Encoding.UTF8.GetByteCount(secondText))
        };
    }

    private static List<string> GetParts(string normalized)
    {
        string[] sections = SplitByStrongSeparators.Split(normalized);
        var parts = new List<string>();
        foreach (string s in sections)
        {
            string t = s.Trim();
            if (t.Length > 0)
                parts.Add(t);
        }

        return parts;
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
