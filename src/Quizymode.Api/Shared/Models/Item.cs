namespace Quizymode.Api.Shared.Models;

public sealed class Item
{
    public Guid Id { get; set; }

    public bool IsPrivate { get; set; }

    public string Question { get; set; } = string.Empty;

    public string CorrectAnswer { get; set; } = string.Empty;

    // Stored as JSONB in PostgreSQL - EF Core handles this automatically
    public List<string> IncorrectAnswers { get; set; } = new(); // 0..4

    public string Explanation { get; set; } = string.Empty;

    public string FuzzySignature { get; set; } = string.Empty; // hex of 64-bit SimHash

    public int FuzzyBucket { get; set; } // top 8 bits (0..255)

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool ReadyForReview { get; set; }

    // Navigation property for keywords (not mapped directly, accessed via ItemKeywords)
    public List<ItemKeyword> ItemKeywords { get; set; } = new();

    // Navigation property for categories (not mapped directly, accessed via CategoryItems)
    public List<CategoryItem> CategoryItems { get; set; } = new();
}

