namespace Quizymode.Api.Shared.Options;

/// <summary>
/// Limits for study guide document uploads (AC 6.6): file size, page count, extracted text size, extraction timeout,
/// zip-bomb protection, and section sizing. Bound from the <c>StudyGuideDocuments</c> configuration section.
/// </summary>
internal sealed record class StudyGuideDocumentOptions
{
    public const string SectionName = "StudyGuideDocuments";

    public int MaxFileBytes { get; set; } = 20 * 1024 * 1024;

    public int MaxPages { get; set; } = 300;

    public int MaxTextBytes { get; set; } = 1_048_576;

    public int ExtractionTimeoutSeconds { get; set; } = 30;

    public long MaxDecompressedBytes { get; set; } = 100L * 1024 * 1024;

    public int SectionTargetBytes { get; set; } = 8_192;

    public int SectionMaxBytes { get; set; } = 10_240;

    /// <summary>Extracted section text is kept this many days after the document's last activity.</summary>
    public int RetentionDays { get; set; } = 30;

    public int CreatesPerHour { get; set; } = 20;
}
