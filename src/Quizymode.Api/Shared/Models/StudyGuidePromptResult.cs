namespace Quizymode.Api.Shared.Models;

public enum StudyGuidePromptResultStatus
{
    Pending = 0,
    Valid = 1,
    Invalid = 2
}

public sealed class StudyGuidePromptResult
{
    public Guid Id { get; set; }
    public Guid ImportSessionId { get; set; }
    public StudyGuideImportSession? ImportSession { get; set; }
    public int ChunkIndex { get; set; }
    public string RawResponseText { get; set; } = string.Empty;
    /// <summary>Parsed JSON array of items (stored as JSON string).</summary>
    public string? ParsedItemsJson { get; set; }
    public StudyGuidePromptResultStatus ValidationStatus { get; set; }
    /// <summary>JSON array of validation message strings.</summary>
    public string? ValidationMessagesJson { get; set; }
    public DateTime CreatedUtc { get; set; }
    public DateTime UpdatedUtc { get; set; }
}
