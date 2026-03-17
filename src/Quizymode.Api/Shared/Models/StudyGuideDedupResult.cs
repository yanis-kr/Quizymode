namespace Quizymode.Api.Shared.Models;

public sealed class StudyGuideDedupResult
{
    public Guid Id { get; set; }
    public Guid ImportSessionId { get; set; }
    public StudyGuideImportSession? ImportSession { get; set; }
    public string RawDedupResponseText { get; set; } = string.Empty;
    public string? ParsedDedupItemsJson { get; set; }
    public StudyGuidePromptResultStatus ValidationStatus { get; set; }
    public DateTime CreatedUtc { get; set; }
}
