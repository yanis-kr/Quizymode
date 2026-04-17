namespace Quizymode.Api.Shared.Models;

public sealed class Item
{
    public Guid Id { get; set; }

    public bool IsRepoManaged { get; set; }

    public bool IsPrivate { get; set; }

    public string Question { get; set; } = string.Empty;

    public ItemSpeechSupport? QuestionSpeech { get; set; }

    public string CorrectAnswer { get; set; } = string.Empty;

    public ItemSpeechSupport? CorrectAnswerSpeech { get; set; }

    // Stored as JSONB in PostgreSQL - EF Core handles this automatically
    public List<string> IncorrectAnswers { get; set; } = new(); // 0..4

    public Dictionary<int, ItemSpeechSupport> IncorrectAnswerSpeech { get; set; } = new();

    public string Explanation { get; set; } = string.Empty;

    public string FuzzySignature { get; set; } = string.Empty; // hex of 64-bit SimHash

    public int FuzzyBucket { get; set; } // top 8 bits (0..255)

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool ReadyForReview { get; set; }

    public string? Source { get; set; }

    /// <summary>
    /// Optional link to the Upload record that created this item (e.g. bulk upload from JSON).
    /// </summary>
    public Guid? UploadId { get; set; }

    /// <summary>
    /// Optional factual risk indicator 0-1: higher = more uncertainty or inferred content.
    /// </summary>
    public decimal? FactualRisk { get; set; }

    /// <summary>
    /// Optional review notes: ambiguity, assumptions, outdated info, etc.
    /// </summary>
    public string? ReviewComments { get; set; }

    // Navigation property for keywords (not mapped directly, accessed via ItemKeywords)
    public List<ItemKeyword> ItemKeywords { get; set; } = new();

    // Navigation property for category
    public Guid? CategoryId { get; set; }
    public Category? Category { get; set; }

    /// <summary>Rank-1 navigation keyword (primary topic). Required for items in navigation tree.</summary>
    public Guid? NavigationKeywordId1 { get; set; }
    public Keyword? NavigationKeyword1 { get; set; }

    /// <summary>Rank-2 navigation keyword (subtopic). Required for items in navigation tree.</summary>
    public Guid? NavigationKeywordId2 { get; set; }
    public Keyword? NavigationKeyword2 { get; set; }
}
