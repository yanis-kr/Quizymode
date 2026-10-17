using System.Text;
using FluentAssertions;
using Quizymode.Api.Features.StudyGuideDocuments;
using Quizymode.Api.Features.StudyGuideDocuments.Extraction;
using Quizymode.Api.Features.StudyGuideUploads;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Options;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

public sealed class StudyGuideExtractionTests
{
    private static string[] Page(int number, params string[] body) =>
        ["Biology Unit 3 Study Guide", .. body, $"Page {number} of 4"];

    [Fact]
    public async Task Pdf_ExtractsPagesAndStripsRepeatedHeadersAndPageNumbers()
    {
        byte[] pdf = StudyGuideFixtures.Pdf(
            Page(1, "Photosynthesis converts light energy into chemical energy.", "Chlorophyll absorbs mostly red and blue light."),
            Page(2, "The Calvin cycle fixes carbon dioxide into sugars.", "It runs in the stroma of the chloroplast."),
            Page(3, "Cellular respiration releases energy stored in glucose.", "Mitochondria are the site of aerobic respiration."),
            Page(4, "Fermentation regenerates NAD+ without oxygen.", "Yeast produce ethanol during fermentation."));

        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor().ExtractAsync(pdf, CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.IsFailure ? result.Error.Description : null);
        ExtractedDocument document = result.Value;
        document.FileType.Should().Be(StudyGuideFileTypes.Pdf);
        document.PageCount.Should().Be(4);
        document.Pages.Should().HaveCount(4);
        document.Pages[0].Text.Should().Contain("Photosynthesis converts light energy");
        document.FullText.Should().NotContain("Biology Unit 3 Study Guide", "a line repeated on every page is a header");
        document.FullText.Should().NotContain("Page 1 of 4").And.NotContain("Page 4 of 4");
    }

    [Fact]
    public async Task Pdf_MostlyEmptyPages_IsRejectedAsScan()
    {
        byte[] pdf = StudyGuideFixtures.Pdf(
            ["Only this page has selectable text in the whole document, which is long enough."],
            ["3"],
            ["   "]);

        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor().ExtractAsync(pdf, CancellationToken.None);

        result.Error.Should().Be(StudyGuideDocumentErrors.Scanned);
        result.Error.Description.Should().Be("This looks like a scan; only PDFs with selectable text are supported for now.");
    }

    [Fact]
    public async Task Pdf_TooManyPages_IsRejected()
    {
        byte[] pdf = StudyGuideFixtures.Pdf(
            ["First page with enough selectable text to count as text."],
            ["Second page with enough selectable text to count as text."],
            ["Third page with enough selectable text to count as text."]);

        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor(new StudyGuideDocumentOptions { MaxPages = 2 })
            .ExtractAsync(pdf, CancellationToken.None);

        result.Error.Code.Should().Be("StudyGuideDocument.TooManyPages");
    }

    [Fact]
    public async Task Docx_ReadsParagraphsAndHeadings()
    {
        byte[] docx = StudyGuideFixtures.Docx(
            "# Cells",
            "Cells are the basic unit of life.",
            "# Genetics",
            "DNA carries hereditary information.");

        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor().ExtractAsync(docx, CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.IsFailure ? result.Error.Description : null);
        result.Value.FileType.Should().Be(StudyGuideFileTypes.Docx);
        result.Value.PageCount.Should().BeNull();
        result.Value.Blocks.Should().HaveCount(4);
        result.Value.Blocks.Where(block => block.IsHeading).Select(block => block.Text).Should().Equal("Cells", "Genetics");
    }

    [Fact]
    public async Task Pptx_ReadsSlides()
    {
        byte[] pptx = StudyGuideFixtures.Pptx(
            ["The water cycle", "Evaporation turns liquid water into vapor."],
            ["Condensation", "Vapor cools and forms clouds."]);

        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor().ExtractAsync(pptx, CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.IsFailure ? result.Error.Description : null);
        result.Value.FileType.Should().Be(StudyGuideFileTypes.Pptx);
        result.Value.PageCount.Should().Be(2);
        result.Value.Pages.Select(page => page.Number).Should().Equal(1, 2);
        result.Value.Pages[1].Text.Should().Be("Condensation\nVapor cools and forms clouds.");
    }

    [Fact]
    public async Task Text_MarkdownHeadingsBecomeHeadingBlocks()
    {
        byte[] text = StudyGuideTestData.Bytes("﻿# Plants\nPlants make food.\n\nThey need water.\n## Animals\nAnimals eat food.");

        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor().ExtractAsync(text, CancellationToken.None);

        result.Value.FileType.Should().Be(StudyGuideFileTypes.Txt);
        result.Value.Blocks.Select(block => (block.Text, block.IsHeading)).Should().Equal(
            ("# Plants", true),
            ("Plants make food.", false),
            ("They need water.", false),
            ("## Animals", true),
            ("Animals eat food.", false));
    }

    [Theory]
    [InlineData(new byte[] { 0xFF, 0xFE, 0x00, 0x41 })]
    [InlineData(new byte[] { 0x41, 0x42, 0x00, 0x43 })]
    [InlineData(new byte[] { 0xC3, 0x28, 0x41, 0x42 })]
    public async Task BinaryOrInvalidUtf8_IsUnsupported(byte[] content)
    {
        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor().ExtractAsync(content, CancellationToken.None);

        result.Error.Should().Be(StudyGuideDocumentErrors.UnsupportedType);
    }

    [Fact]
    public async Task ZipThatIsNotOfficeDocument_IsUnsupported()
    {
        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor().ExtractAsync(StudyGuideFixtures.PlainZip(), CancellationToken.None);

        result.Error.Should().Be(StudyGuideDocumentErrors.UnsupportedType);
    }

    [Fact]
    public async Task ZipExpandingBeyondLimit_IsRejected()
    {
        byte[] docx = StudyGuideFixtures.Docx("Some text that expands a little when unzipped.");

        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor(new StudyGuideDocumentOptions { MaxDecompressedBytes = 100 })
            .ExtractAsync(docx, CancellationToken.None);

        result.Error.Code.Should().Be("StudyGuideDocument.FileTooLarge");
    }

    [Fact]
    public async Task CorruptPdf_IsUnreadable()
    {
        byte[] content = Encoding.ASCII.GetBytes("%PDF-1.7\nthis is not really a pdf");

        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor().ExtractAsync(content, CancellationToken.None);

        result.Error.Should().Be(StudyGuideDocumentErrors.Unreadable);
    }

    [Fact]
    public async Task FileOverMaxBytes_IsRejected()
    {
        Result<ExtractedDocument> result = await StudyGuideTestData.Extractor(new StudyGuideDocumentOptions { MaxFileBytes = 10 })
            .ExtractAsync(StudyGuideTestData.Bytes("more than ten bytes of text"), CancellationToken.None);

        result.Error.Code.Should().Be("StudyGuideDocument.FileTooLarge");
    }

    [Fact]
    public void TextOverMaxTextBytes_IsRejected()
    {
        Result<ExtractedDocument> result = StudyGuideTestData.Extractor(new StudyGuideDocumentOptions { MaxTextBytes = 100 })
            .FromText(StudyGuideTestData.Utf8(101));

        result.Error.Code.Should().Be("StudyGuideDocument.TextTooLarge");
    }

    [Fact]
    public void WhitespaceOnlyText_IsEmpty()
    {
        StudyGuideTestData.Extractor().FromText(" \n\n\t ").Error.Should().Be(StudyGuideDocumentErrors.Empty);
    }

    [Fact]
    public void Extraction_StopsWhenTheTimeoutTokenFires()
    {
        // ExtractAsync links this token to ExtractionTimeoutSeconds and reports StudyGuideDocument.ExtractionTimeout.
        byte[] pdf = StudyGuideFixtures.Pdf(["A page of selectable text that is long enough to count."]);
        using CancellationTokenSource expired = new();
        expired.Cancel();

        Action extract = () => StudyGuideTestData.Extractor().Extract(pdf, expired.Token);

        extract.Should().Throw<OperationCanceledException>();
    }

    [Fact]
    public void HeaderFooterStripping_NeedsAtLeastThreePages()
    {
        List<ExtractedPage> pages = StudyGuideTextExtractor.StripHeadersAndFooters(
        [
            new ExtractedPage(1, "Header\nBody one\n1"),
            new ExtractedPage(2, "Header\nBody two\n2")
        ]);

        pages[0].Text.Should().Be("Header\nBody one", "repeats are only stripped with 3+ pages, page numbers always");
        pages[1].Text.Should().Be("Header\nBody two");
    }

    [Fact]
    public void HeaderFooterStripping_RemovesLinesOnSixtyPercentOfPagesWithDigitsNormalized()
    {
        List<ExtractedPage> pages = StudyGuideTextExtractor.StripHeadersAndFooters(
        [
            new ExtractedPage(1, "Chapter 1 notes\nAlpha"),
            new ExtractedPage(2, "Chapter 2 notes\nBeta"),
            new ExtractedPage(3, "Chapter 3 notes\nGamma"),
            new ExtractedPage(4, "Delta"),
            new ExtractedPage(5, "Epsilon")
        ]);

        pages.Select(page => page.Text).Should().Equal("Alpha", "Beta", "Gamma", "Delta", "Epsilon");
    }

    [Theory]
    [InlineData("Heading1", true)]
    [InlineData("heading 2", true)]
    [InlineData("Heading3", true)]
    [InlineData("Title", true)]
    [InlineData("Heading4", false)]
    [InlineData("Normal", false)]
    [InlineData(null, false)]
    public void HeadingStyles(string? styleId, bool expected)
    {
        StudyGuideTextExtractor.IsHeadingStyle(styleId).Should().Be(expected);
    }
}

public sealed class StudyGuideSectionerTests
{
    [Fact]
    public void Pdf_PacksWholePagesWithMarkersAndLabels()
    {
        string pageText = new string('x', 3000);
        ExtractedDocument document = new(
            StudyGuideFileTypes.Pdf,
            4,
            [new ExtractedPage(1, pageText), new ExtractedPage(2, pageText), new ExtractedPage(3, pageText), new ExtractedPage(4, "Short last page.")],
            []);

        List<SectionDraft> sections = StudyGuideSectioner.Build(document, 8192, 10240);

        sections.Should().HaveCount(2);
        sections[0].Label.Should().Be("pp. 1–2");
        sections[0].PageStart.Should().Be(1);
        sections[0].PageEnd.Should().Be(2);
        sections[0].Text.Should().StartWith("[p. 1]\n").And.Contain("\n\n[p. 2]\n");
        sections[1].Label.Should().Be("pp. 3–4");
        sections.Should().OnlyContain(section => section.SizeBytes <= 10240);
        sections[0].TextSha256.Should().Be(StudyGuideUploadText.ComputeHash(sections[0].Text));
        sections.Select(section => section.Index).Should().Equal(0, 1);
    }

    [Fact]
    public void Pdf_OversizedPageIsSplitAtParagraphs()
    {
        string paragraph = new string('y', 4000);
        ExtractedDocument document = new(
            StudyGuideFileTypes.Pdf,
            1,
            [new ExtractedPage(7, $"{paragraph}\n\n{paragraph}\n\n{paragraph}\n\n{paragraph}")],
            []);

        List<SectionDraft> sections = StudyGuideSectioner.Build(document, 8192, 10240);

        sections.Should().HaveCountGreaterThan(1);
        sections.Should().OnlyContain(section => section.SizeBytes <= 10240 && section.Label == "p. 7" && section.Text.StartsWith("[p. 7]\n"));
    }

    [Fact]
    public void Pptx_UsesSlideLabels()
    {
        ExtractedDocument document = new(
            StudyGuideFileTypes.Pptx,
            3,
            [new ExtractedPage(1, "Intro"), new ExtractedPage(2, "Details"), new ExtractedPage(3, "Summary")],
            []);

        List<SectionDraft> sections = StudyGuideSectioner.Build(document, 8192, 10240);

        sections.Should().ContainSingle();
        sections[0].Label.Should().Be("Slides 1–3");
        sections[0].Text.Should().StartWith("[slide 1]\nIntro");
    }

    [Fact]
    public void Blocks_SplitAtHeadingsWhenTheyExceedTarget()
    {
        string body = new string('z', 5000);
        ExtractedDocument document = new(
            StudyGuideFileTypes.Docx,
            null,
            [],
            [
                new ExtractedBlock("Cells", true),
                new ExtractedBlock(body, false),
                new ExtractedBlock("Genetics", true),
                new ExtractedBlock(body, false)
            ]);

        List<SectionDraft> sections = StudyGuideSectioner.Build(document, 8192, 10240);

        sections.Select(section => section.Label).Should().Equal("Cells", "Genetics");
        sections.Should().OnlyContain(section => section.PageStart == null && section.PageEnd == null);
        sections[1].Text.Should().StartWith("Genetics\n\n");
    }

    [Fact]
    public void Blocks_SmallHeadingGroupsArePackedAndHugeParagraphsSplit()
    {
        ExtractedDocument small = new(
            StudyGuideFileTypes.Txt,
            null,
            [],
            [new ExtractedBlock("# A", true), new ExtractedBlock("one", false), new ExtractedBlock("# B", true), new ExtractedBlock("two", false)]);
        StudyGuideSectioner.Build(small, 8192, 10240).Should().ContainSingle().Which.Label.Should().Be("A");

        ExtractedDocument huge = new(StudyGuideFileTypes.Txt, null, [], [new ExtractedBlock(string.Join(' ', Enumerable.Repeat("word", 6000)), false)]);
        List<SectionDraft> sections = StudyGuideSectioner.Build(huge, 8192, 10240);
        sections.Should().HaveCountGreaterThan(2);
        sections.Should().OnlyContain(section => section.SizeBytes <= 10240);
        sections[0].Label.Should().Be("Section 1");
    }

    [Fact]
    public void LongHeadingLabelIsTruncatedTo120Characters()
    {
        ExtractedDocument document = new(StudyGuideFileTypes.Docx, null, [], [new ExtractedBlock(new string('h', 300), true), new ExtractedBlock("text", false)]);

        StudyGuideSectioner.Build(document, 8192, 10240).Single().Label.Should().HaveLength(120);
    }

    [Fact]
    public void MultiByteTextNeverExceedsMaxBytes()
    {
        string emoji = string.Concat(Enumerable.Repeat("\U0001F600", 6000));
        ExtractedDocument document = new(StudyGuideFileTypes.Txt, null, [], [new ExtractedBlock(emoji, false)]);

        List<SectionDraft> sections = StudyGuideSectioner.Build(document, 8192, 10240);

        sections.Should().OnlyContain(section => Encoding.UTF8.GetByteCount(section.Text) <= 10240);
        string.Concat(sections.Select(section => section.Text)).Should().Be(emoji);
    }

    [Fact]
    public void PageMarkersAreStrippedAndSplit()
    {
        const string text = "[p. 3]\nAlpha beta\n\n[p. 4]\nGamma delta";

        StudyGuideSectioner.StripPageMarkers(text).Should().NotContain("[p.");
        StudyGuideSectioner.SplitByPageMarkers(text).Select(segment => segment.Page).Should().Equal(3, 4);
    }
}
