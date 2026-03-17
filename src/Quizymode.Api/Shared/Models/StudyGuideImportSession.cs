namespace Quizymode.Api.Shared.Models;

public enum StudyGuideImportSessionStatus
{
    Draft = 0,
    ChunksGenerated = 1,
    InProgress = 2,
    Completed = 3,
    Abandoned = 4
}

public sealed class StudyGuideImportSession
{
    public Guid Id { get; set; }
    public Guid StudyGuideId { get; set; }
    public StudyGuide? StudyGuide { get; set; }
    public string UserId { get; set; } = string.Empty;
    /// <summary>Category name for all items in this session.</summary>
    public string CategoryName { get; set; } = string.Empty;
    /// <summary>JSON array of navigation path keywords, e.g. ["rank1", "rank2"].</summary>
    public string NavigationKeywordPathJson { get; set; } = "[]";
    /// <summary>JSON array of default extra keywords to apply to all items.</summary>
    public string? DefaultKeywordsJson { get; set; }
    public int TargetItemsPerChunk { get; set; }
    public StudyGuideImportSessionStatus Status { get; set; }
    public DateTime CreatedUtc { get; set; }
    public DateTime UpdatedUtc { get; set; }
}
