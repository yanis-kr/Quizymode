using System.Text;
using System.Text.RegularExpressions;
using Quizymode.Api.Features.StudyGuideUploads;

namespace Quizymode.Api.Features.StudyGuideDocuments.Extraction;

/// <summary>A section ready to be stored: text at most SectionMaxBytes UTF-8 bytes, hashed like AC 6.5 text.</summary>
internal sealed record SectionDraft(
    int Index,
    string Label,
    int? PageStart,
    int? PageEnd,
    string Text,
    int SizeBytes,
    string TextSha256);

/// <summary>
/// Splits extracted text into sections of at most <c>maxBytes</c> UTF-8 bytes, packing toward <c>targetBytes</c>.
/// PDFs pack whole pages and PPTX whole slides (an oversized page is split at paragraph, then line, then word
/// boundaries); each page in a section starts with a marker line such as <c>[p. 12]</c> or <c>[slide 4]</c> so the model
/// can report pages. DOCX and text split at headings, then paragraphs.
/// </summary>
internal static partial class StudyGuideSectioner
{
    public const int MaxLabelLength = 120;

    public static List<SectionDraft> Build(ExtractedDocument document, int targetBytes, int maxBytes)
    {
        int max = Math.Max(256, maxBytes);
        int target = Math.Clamp(targetBytes, 128, max);
        List<(string Label, int? PageStart, int? PageEnd, string Text)> raw = document.IsPaged
            ? BuildPaged(document, target, max)
            : BuildBlocks(document.Blocks, target, max);

        return raw
            .Select((section, index) => new SectionDraft(
                index,
                section.Label,
                section.PageStart,
                section.PageEnd,
                section.Text,
                ByteCount(section.Text),
                StudyGuideUploadText.ComputeHash(section.Text)))
            .ToList();
    }

    public static string PageMarker(string fileType, int number) =>
        fileType == StudyGuideFileTypes.Pptx ? $"[slide {number}]" : $"[p. {number}]";

    /// <summary>Removes page marker lines (used for previews and the source-quote check).</summary>
    public static string StripPageMarkers(string text) =>
        PageMarkerLineRegex().Replace(text, string.Empty).Trim('\n');

    /// <summary>Splits section text into (page number, text) segments using its marker lines; unmarked text has a null page.</summary>
    public static List<(int? Page, string Text)> SplitByPageMarkers(string text)
    {
        List<(int? Page, string Text)> segments = [];
        int? currentPage = null;
        StringBuilder current = new();
        foreach (string line in text.Split('\n'))
        {
            Match marker = PageMarkerLineRegex().Match(line);
            if (marker.Success && marker.Value.Length == line.Length)
            {
                if (current.Length > 0 || currentPage is not null)
                {
                    segments.Add((currentPage, current.ToString()));
                }

                currentPage = int.Parse(marker.Groups["n"].Value, System.Globalization.CultureInfo.InvariantCulture);
                current.Clear();
                continue;
            }

            current.Append(line).Append('\n');
        }

        segments.Add((currentPage, current.ToString()));
        return segments;
    }

    private static List<(string, int?, int?, string)> BuildPaged(ExtractedDocument document, int target, int max)
    {
        bool isSlides = document.FileType == StudyGuideFileTypes.Pptx;
        List<(string, int?, int?, string)> sections = [];
        List<(int Number, string Text)> current = [];
        int currentBytes = 0;

        void Flush()
        {
            if (current.Count == 0)
            {
                return;
            }

            int start = current[0].Number;
            int end = current[^1].Number;
            sections.Add((PageLabel(isSlides, start, end), start, end, string.Join("\n\n", current.Select(page => page.Text))));
            current.Clear();
            currentBytes = 0;
        }

        foreach (ExtractedPage page in document.Pages)
        {
            if (page.Text.Trim().Length == 0)
            {
                continue;
            }

            string marker = PageMarker(document.FileType, page.Number);
            string withMarker = marker + "\n" + page.Text;
            int bytes = ByteCount(withMarker);

            if (bytes > max)
            {
                Flush();
                int budget = max - ByteCount(marker) - 1;
                foreach (string piece in Pack(SplitToFit(page.Text, budget), "\n\n", target - ByteCount(marker) - 1, budget))
                {
                    sections.Add((PageLabel(isSlides, page.Number, page.Number), page.Number, page.Number, marker + "\n" + piece));
                }

                continue;
            }

            if (current.Count > 0 && currentBytes + 2 + bytes > target)
            {
                Flush();
            }

            current.Add((page.Number, withMarker));
            currentBytes += (current.Count > 1 ? 2 : 0) + bytes;
        }

        Flush();
        return sections;
    }

    private static List<(string, int?, int?, string)> BuildBlocks(IReadOnlyList<ExtractedBlock> blocks, int target, int max)
    {
        // Group paragraphs under their heading, then pack groups toward the target size.
        List<(string? Heading, List<string> Paragraphs)> groups = [];
        foreach (ExtractedBlock block in blocks)
        {
            if (block.IsHeading || groups.Count == 0)
            {
                groups.Add((block.IsHeading ? HeadingLabel(block.Text) : null, []));
            }

            groups[^1].Paragraphs.Add(block.Text);
        }

        List<(string? Heading, string Text)> pieces = [];
        foreach ((string? heading, List<string> paragraphs) in groups)
        {
            string groupText = string.Join("\n\n", paragraphs);
            if (ByteCount(groupText) <= max)
            {
                pieces.Add((heading, groupText));
                continue;
            }

            List<string> parts = Pack(paragraphs.SelectMany(paragraph => SplitToFit(paragraph, max)).ToList(), "\n\n", target, max);
            for (int i = 0; i < parts.Count; i++)
            {
                pieces.Add((heading is null ? null : i == 0 ? heading : Truncate($"{heading} (cont.)", MaxLabelLength), parts[i]));
            }
        }

        List<(string, int?, int?, string)> sections = [];
        List<(string? Heading, string Text)> current = [];
        int currentBytes = 0;

        void Flush()
        {
            if (current.Count == 0)
            {
                return;
            }

            string label = current.Select(piece => piece.Heading).FirstOrDefault(heading => heading is not null)
                ?? $"Section {sections.Count + 1}";
            sections.Add((label, null, null, string.Join("\n\n", current.Select(piece => piece.Text))));
            current.Clear();
            currentBytes = 0;
        }

        foreach ((string? heading, string text) in pieces)
        {
            int bytes = ByteCount(text);
            if (current.Count > 0 && currentBytes + 2 + bytes > target)
            {
                Flush();
            }

            current.Add((heading, text));
            currentBytes += (current.Count > 1 ? 2 : 0) + bytes;
        }

        Flush();
        return sections;
    }

    /// <summary>Splits text into pieces of at most <paramref name="maxBytes"/>: paragraphs, then lines, then words, then characters.</summary>
    internal static List<string> SplitToFit(string text, int maxBytes)
    {
        if (ByteCount(text) <= maxBytes)
        {
            return [text];
        }

        string[] paragraphs = text.Split("\n\n", StringSplitOptions.RemoveEmptyEntries);
        if (paragraphs.Length > 1)
        {
            return Pack(paragraphs.SelectMany(paragraph => SplitToFit(paragraph, maxBytes)).ToList(), "\n\n", maxBytes, maxBytes);
        }

        string[] lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length > 1)
        {
            return Pack(lines.SelectMany(line => SplitToFit(line, maxBytes)).ToList(), "\n", maxBytes, maxBytes);
        }

        string[] words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length > 1)
        {
            return Pack(words.SelectMany(word => SplitToFit(word, maxBytes)).ToList(), " ", maxBytes, maxBytes);
        }

        // A single huge token: cut on character boundaries (never inside a surrogate pair).
        List<string> chunks = [];
        StringBuilder chunk = new();
        int chunkBytes = 0;
        for (int i = 0; i < text.Length; i++)
        {
            int length = char.IsHighSurrogate(text[i]) && i + 1 < text.Length ? 2 : 1;
            string character = text.Substring(i, length);
            int bytes = ByteCount(character);
            if (chunkBytes + bytes > maxBytes && chunk.Length > 0)
            {
                chunks.Add(chunk.ToString());
                chunk.Clear();
                chunkBytes = 0;
            }

            chunk.Append(character);
            chunkBytes += bytes;
            i += length - 1;
        }

        if (chunk.Length > 0)
        {
            chunks.Add(chunk.ToString());
        }

        return chunks;
    }

    /// <summary>Greedily joins pieces (each at most <paramref name="maxBytes"/>) up to <paramref name="targetBytes"/>.</summary>
    private static List<string> Pack(List<string> pieces, string separator, int targetBytes, int maxBytes)
    {
        int separatorBytes = ByteCount(separator);
        int limit = Math.Min(Math.Max(targetBytes, 1), maxBytes);
        List<string> packed = [];
        StringBuilder current = new();
        int currentBytes = 0;
        foreach (string piece in pieces)
        {
            int bytes = ByteCount(piece);
            if (current.Length > 0 && currentBytes + separatorBytes + bytes > limit)
            {
                packed.Add(current.ToString());
                current.Clear();
                currentBytes = 0;
            }

            if (current.Length > 0)
            {
                current.Append(separator);
                currentBytes += separatorBytes;
            }

            current.Append(piece);
            currentBytes += bytes;
        }

        if (current.Length > 0)
        {
            packed.Add(current.ToString());
        }

        return packed;
    }

    private static string PageLabel(bool isSlides, int start, int end) =>
        isSlides
            ? start == end ? $"Slide {start}" : $"Slides {start}–{end}"
            : start == end ? $"p. {start}" : $"pp. {start}–{end}";

    private static string HeadingLabel(string text)
    {
        string label = text.TrimStart().TrimStart('#').Trim();
        return Truncate(label.Length == 0 ? text.Trim() : label, MaxLabelLength);
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength].TrimEnd();

    private static int ByteCount(string text) => Encoding.UTF8.GetByteCount(text);

    [GeneratedRegex(@"^\[(?:p\.|slide) (?<n>\d{1,5})\]$", RegexOptions.Multiline)]
    private static partial Regex PageMarkerLineRegex();
}
