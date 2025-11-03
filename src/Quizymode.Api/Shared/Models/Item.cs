using System.ComponentModel.DataAnnotations;

namespace Quizymode.Api.Shared.Models;

public sealed class Item
{
    public Guid Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string CategoryId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string SubcategoryId { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Visibility { get; set; } = "global"; // "global" | "private"

    [Required]
    [MaxLength(1000)]
    public string Question { get; set; } = string.Empty;

    [Required]
    [MaxLength(500)]
    public string CorrectAnswer { get; set; } = string.Empty;

    // Stored as JSONB in PostgreSQL - EF Core handles this automatically
    public List<string> IncorrectAnswers { get; set; } = new(); // 0..4

    [MaxLength(2000)]
    public string Explanation { get; set; } = string.Empty;

    [MaxLength(64)]
    public string FuzzySignature { get; set; } = string.Empty; // hex of 64-bit SimHash

    public int FuzzyBucket { get; set; } // top 8 bits (0..255)

    [Required]
    [MaxLength(100)]
    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

