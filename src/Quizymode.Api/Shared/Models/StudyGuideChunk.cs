namespace Quizymode.Api.Shared.Models;

public sealed class StudyGuideChunk
{
    public Guid Id { get; set; }
    public Guid ImportSessionId { get; set; }
    public StudyGuideImportSession? ImportSession { get; set; }
    public int ChunkIndex { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ChunkText { get; set; } = string.Empty;
    public int SizeBytes { get; set; }
    /// <summary>Full prompt text for the AI (copy/paste).</summary>
    public string PromptText { get; set; } = string.Empty;
    public DateTime CreatedUtc { get; set; }
}
