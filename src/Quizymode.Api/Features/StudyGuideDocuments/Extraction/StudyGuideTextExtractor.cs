using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml.Packaging;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Options;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;
using Drawing = DocumentFormat.OpenXml.Drawing;
using Wordprocessing = DocumentFormat.OpenXml.Wordprocessing;

namespace Quizymode.Api.Features.StudyGuideDocuments.Extraction;

internal static class StudyGuideFileTypes
{
    public const string Pdf = "pdf";
    public const string Docx = "docx";
    public const string Pptx = "pptx";
    public const string Txt = "txt";
}

/// <summary>A PDF page or a PowerPoint slide (1-based number) with its cleaned text.</summary>
internal sealed record ExtractedPage(int Number, string Text);

/// <summary>A Word or text paragraph; headings (Heading 1–3, Title, Markdown #) start new sections.</summary>
internal sealed record ExtractedBlock(string Text, bool IsHeading);

/// <summary>Extracted text: <see cref="Pages"/> for pdf/pptx, <see cref="Blocks"/> for docx/txt.</summary>
internal sealed record ExtractedDocument(
    string FileType,
    int? PageCount,
    IReadOnlyList<ExtractedPage> Pages,
    IReadOnlyList<ExtractedBlock> Blocks)
{
    public bool IsPaged => FileType is StudyGuideFileTypes.Pdf or StudyGuideFileTypes.Pptx;

    /// <summary>All extracted text without page markers, used for the document-level text hash.</summary>
    public string FullText => IsPaged
        ? string.Join("\n\n", Pages.Select(page => page.Text))
        : string.Join("\n\n", Blocks.Select(block => block.Text));
}

internal interface IStudyGuideTextExtractor
{
    /// <summary>Detects the file type by magic bytes and extracts its text (read-only, bounded by size, page, and time limits).</summary>
    Task<Result<ExtractedDocument>> ExtractAsync(byte[] content, CancellationToken cancellationToken);

    /// <summary>Wraps pasted text as a text document.</summary>
    Result<ExtractedDocument> FromText(string text);
}

/// <summary>
/// Pure text extraction for study guide uploads. PDFs are read with PdfPig (content-order text per page, repeated
/// headers/footers and bare page numbers removed, scans rejected); DOCX and PPTX are read with the Open XML SDK
/// (read-only, no macros are ever executed, zip entry sizes are checked first); anything else must be valid UTF-8 text.
/// </summary>
internal sealed partial class StudyGuideTextExtractor(IOptions<StudyGuideDocumentOptions> options) : IStudyGuideTextExtractor
{
    private const int ScannedPageMinChars = 40;
    private const int MaxHeaderFooterLineLength = 150;
    private const int MaxZipEntries = 20_000;

    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    private readonly StudyGuideDocumentOptions _options = options.Value;

    public async Task<Result<ExtractedDocument>> ExtractAsync(byte[] content, CancellationToken cancellationToken)
    {
        if (content.Length == 0)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.Empty);
        }

        if (content.Length > _options.MaxFileBytes)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.FileTooLarge(_options.MaxFileBytes));
        }

        using CancellationTokenSource timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, _options.ExtractionTimeoutSeconds)));
        CancellationToken token = timeout.Token;

        try
        {
            return await Task.Run(() => Extract(content, token), token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.ExtractionTimeout);
        }
    }

    public Result<ExtractedDocument> FromText(string text) => BuildTextDocument(text);

    internal Result<ExtractedDocument> Extract(byte[] content, CancellationToken cancellationToken)
    {
        if (IsPdf(content))
        {
            return Guard(() => ExtractPdf(content, cancellationToken));
        }

        if (IsZip(content))
        {
            return Guard(() => ExtractOpenXml(content, cancellationToken));
        }

        string? text = TryDecodeText(content);
        return text is null
            ? Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.UnsupportedType)
            : BuildTextDocument(text);
    }

    internal static bool IsPdf(byte[] content)
    {
        int limit = Math.Min(content.Length - 4, 1024);
        for (int i = 0; i < limit; i++)
        {
            if (content[i] == '%' && content[i + 1] == 'P' && content[i + 2] == 'D' && content[i + 3] == 'F')
            {
                return true;
            }

            // Only whitespace may precede the header.
            if (content[i] is not ((byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n'))
            {
                return false;
            }
        }

        return false;
    }

    internal static bool IsZip(byte[] content) =>
        content.Length >= 4 && content[0] == 'P' && content[1] == 'K' && content[2] == 3 && content[3] == 4;

    private static Result<ExtractedDocument> Guard(Func<Result<ExtractedDocument>> extract)
    {
        try
        {
            return extract();
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception)
        {
            // Corrupt, encrypted, or otherwise unparseable input. Never surface parser details to the user.
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.Unreadable);
        }
    }

    private Result<ExtractedDocument> ExtractPdf(byte[] content, CancellationToken cancellationToken)
    {
        using PdfDocument document = PdfDocument.Open(content, new ParsingOptions { UseLenientParsing = true, SkipMissingFonts = true });
        int pageCount = document.NumberOfPages;
        if (pageCount > _options.MaxPages)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.TooManyPages(_options.MaxPages));
        }

        List<ExtractedPage> pages = [];
        long totalBytes = 0;
        foreach (Page page in document.GetPages())
        {
            cancellationToken.ThrowIfCancellationRequested();
            string text = NormalizeLines(ContentOrderTextExtractor.GetText(page));
            totalBytes += Encoding.UTF8.GetByteCount(text);
            if (totalBytes > _options.MaxTextBytes * 4L)
            {
                return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.TextTooLarge(_options.MaxTextBytes));
            }

            pages.Add(new ExtractedPage(page.Number, text));
        }

        if (pages.Count == 0)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.Empty);
        }

        int sparsePages = pages.Count(page => CountNonWhitespace(page.Text) < ScannedPageMinChars);
        if (sparsePages * 2 > pages.Count)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.Scanned);
        }

        List<ExtractedPage> cleaned = StripHeadersAndFooters(pages);
        return Finish(new ExtractedDocument(StudyGuideFileTypes.Pdf, pageCount, cleaned, []));
    }

    private Result<ExtractedDocument> ExtractOpenXml(byte[] content, CancellationToken cancellationToken)
    {
        string? kind;
        using (MemoryStream zipStream = new(content, writable: false))
        using (ZipArchive archive = new(zipStream, ZipArchiveMode.Read))
        {
            if (archive.Entries.Count > MaxZipEntries)
            {
                return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.Unreadable);
            }

            long uncompressed = 0;
            bool hasWord = false;
            bool hasPresentation = false;
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                uncompressed += entry.Length;
                if (uncompressed > _options.MaxDecompressedBytes)
                {
                    return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.FileTooLarge(_options.MaxFileBytes));
                }

                hasWord |= string.Equals(entry.FullName, "word/document.xml", StringComparison.OrdinalIgnoreCase);
                hasPresentation |= string.Equals(entry.FullName, "ppt/presentation.xml", StringComparison.OrdinalIgnoreCase);
            }

            kind = hasWord ? StudyGuideFileTypes.Docx : hasPresentation ? StudyGuideFileTypes.Pptx : null;
        }

        if (kind is null)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.UnsupportedType);
        }

        OpenSettings settings = new() { AutoSave = false };
        using MemoryStream stream = new(content, writable: false);
        return kind == StudyGuideFileTypes.Docx
            ? ExtractDocx(stream, settings, cancellationToken)
            : ExtractPptx(stream, settings, cancellationToken);
    }

    private Result<ExtractedDocument> ExtractDocx(Stream stream, OpenSettings settings, CancellationToken cancellationToken)
    {
        using WordprocessingDocument document = WordprocessingDocument.Open(stream, false, settings);
        Wordprocessing.Body? body = document.MainDocumentPart?.Document?.Body;
        if (body is null)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.Empty);
        }

        List<ExtractedBlock> blocks = [];
        foreach (Wordprocessing.Paragraph paragraph in body.Descendants<Wordprocessing.Paragraph>())
        {
            cancellationToken.ThrowIfCancellationRequested();
            string text = CollapseInline(paragraph.InnerText);
            if (text.Length == 0)
            {
                continue;
            }

            string? styleId = paragraph.ParagraphProperties?.ParagraphStyleId?.Val?.Value;
            blocks.Add(new ExtractedBlock(text, IsHeadingStyle(styleId)));
        }

        return Finish(new ExtractedDocument(StudyGuideFileTypes.Docx, null, [], blocks));
    }

    private Result<ExtractedDocument> ExtractPptx(Stream stream, OpenSettings settings, CancellationToken cancellationToken)
    {
        using PresentationDocument document = PresentationDocument.Open(stream, false, settings);
        PresentationPart? presentationPart = document.PresentationPart;
        DocumentFormat.OpenXml.Presentation.SlideIdList? slideIds = presentationPart?.Presentation?.SlideIdList;
        if (presentationPart is null || slideIds is null)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.Empty);
        }

        List<DocumentFormat.OpenXml.Presentation.SlideId> slides = slideIds.Elements<DocumentFormat.OpenXml.Presentation.SlideId>().ToList();
        if (slides.Count > _options.MaxPages)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.TooManyPages(_options.MaxPages));
        }

        List<ExtractedPage> pages = [];
        int number = 0;
        foreach (DocumentFormat.OpenXml.Presentation.SlideId slideId in slides)
        {
            cancellationToken.ThrowIfCancellationRequested();
            number++;
            string? relationshipId = slideId.RelationshipId?.Value;
            if (relationshipId is null || presentationPart.GetPartById(relationshipId) is not SlidePart slidePart)
            {
                continue;
            }

            List<string> lines = ReadDrawingParagraphs(slidePart.Slide);
            if (slidePart.NotesSlidePart?.NotesSlide is { } notes)
            {
                lines.AddRange(ReadDrawingParagraphs(notes));
            }

            pages.Add(new ExtractedPage(number, string.Join("\n", lines)));
        }

        return Finish(new ExtractedDocument(StudyGuideFileTypes.Pptx, slides.Count, pages, []));
    }

    private static List<string> ReadDrawingParagraphs(DocumentFormat.OpenXml.OpenXmlElement? root)
    {
        if (root is null)
        {
            return [];
        }

        return root.Descendants<Drawing.Paragraph>()
            .Select(paragraph => CollapseInline(string.Concat(paragraph.Descendants<Drawing.Text>().Select(text => text.Text))))
            .Where(line => line.Length > 0)
            .ToList();
    }

    private Result<ExtractedDocument> BuildTextDocument(string text)
    {
        string normalized = NormalizeLines(text.TrimStart('﻿'));
        List<ExtractedBlock> blocks = [];
        StringBuilder paragraph = new();

        void FlushParagraph()
        {
            string value = paragraph.ToString().Trim();
            if (value.Length > 0)
            {
                blocks.Add(new ExtractedBlock(value, false));
            }

            paragraph.Clear();
        }

        foreach (string line in normalized.Split('\n'))
        {
            if (line.Trim().Length == 0)
            {
                FlushParagraph();
                continue;
            }

            if (MarkdownHeadingRegex().IsMatch(line))
            {
                FlushParagraph();
                blocks.Add(new ExtractedBlock(line.Trim(), true));
                continue;
            }

            if (paragraph.Length > 0)
            {
                paragraph.Append('\n');
            }

            paragraph.Append(line.TrimEnd());
        }

        FlushParagraph();
        return Finish(new ExtractedDocument(StudyGuideFileTypes.Txt, null, [], blocks));
    }

    private Result<ExtractedDocument> Finish(ExtractedDocument document)
    {
        string fullText = document.FullText;
        if (CountNonWhitespace(fullText) == 0)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.Empty);
        }

        if (Encoding.UTF8.GetByteCount(fullText) > _options.MaxTextBytes)
        {
            return Result.Failure<ExtractedDocument>(StudyGuideDocumentErrors.TextTooLarge(_options.MaxTextBytes));
        }

        return Result.Success(document);
    }

    internal static string? TryDecodeText(byte[] content)
    {
        string text;
        try
        {
            text = StrictUtf8.GetString(content);
        }
        catch (DecoderFallbackException)
        {
            return null;
        }

        return text.Contains('\0') ? null : text;
    }

    internal static bool IsHeadingStyle(string? styleId)
    {
        if (string.IsNullOrWhiteSpace(styleId))
        {
            return false;
        }

        string compact = styleId.Replace(" ", string.Empty, StringComparison.Ordinal);
        return compact.Equals("Title", StringComparison.OrdinalIgnoreCase) ||
               compact.Equals("Heading1", StringComparison.OrdinalIgnoreCase) ||
               compact.Equals("Heading2", StringComparison.OrdinalIgnoreCase) ||
               compact.Equals("Heading3", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Removes lines that repeat (digits normalized) on at least 60% of pages when there are at least 3 pages, plus bare
    /// page-number lines on every page.
    /// </summary>
    internal static List<ExtractedPage> StripHeadersAndFooters(IReadOnlyList<ExtractedPage> pages)
    {
        HashSet<string> repeated = [];
        if (pages.Count >= 3)
        {
            Dictionary<string, int> counts = new(StringComparer.Ordinal);
            foreach (ExtractedPage page in pages)
            {
                HashSet<string> keys = page.Text.Split('\n')
                    .Where(line => line.Trim().Length is > 0 and <= MaxHeaderFooterLineLength)
                    .Select(HeaderFooterKey)
                    .ToHashSet(StringComparer.Ordinal);
                foreach (string key in keys)
                {
                    counts[key] = counts.GetValueOrDefault(key) + 1;
                }
            }

            int threshold = (int)Math.Ceiling(pages.Count * 0.6);
            repeated = counts.Where(pair => pair.Value >= threshold).Select(pair => pair.Key).ToHashSet(StringComparer.Ordinal);
        }

        return pages
            .Select(page => new ExtractedPage(
                page.Number,
                NormalizeLines(string.Join("\n", page.Text.Split('\n').Where(line =>
                    !PageNumberLineRegex().IsMatch(line) &&
                    !(line.Trim().Length is > 0 and <= MaxHeaderFooterLineLength && repeated.Contains(HeaderFooterKey(line))))))))
            .ToList();
    }

    private static string HeaderFooterKey(string line) =>
        WhitespaceRegex().Replace(DigitsRegex().Replace(line.Trim(), "#"), " ").ToLowerInvariant();

    /// <summary>Unifies line endings, trims trailing spaces, and collapses runs of blank lines.</summary>
    internal static string NormalizeLines(string text)
    {
        string unified = text.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');
        string trimmedLines = string.Join("\n", unified.Split('\n').Select(line => line.TrimEnd()));
        return BlankLinesRegex().Replace(trimmedLines, "\n\n").Trim('\n');
    }

    private static string CollapseInline(string text) => WhitespaceRegex().Replace(text, " ").Trim();

    private static int CountNonWhitespace(string text) => text.Count(character => !char.IsWhiteSpace(character));

    [GeneratedRegex(@"^\s{0,3}#{1,6}\s+\S")]
    private static partial Regex MarkdownHeadingRegex();

    [GeneratedRegex(@"^\s*(?:page\s+)?[-–—]?\s*\d{1,4}\s*[-–—]?\s*(?:(?:of|/)\s*\d{1,4})?\s*$", RegexOptions.IgnoreCase)]
    private static partial Regex PageNumberLineRegex();

    [GeneratedRegex(@"\d+")]
    private static partial Regex DigitsRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex BlankLinesRegex();
}
