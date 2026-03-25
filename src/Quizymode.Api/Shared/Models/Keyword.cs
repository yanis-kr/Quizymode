namespace Quizymode.Api.Shared.Models;

public sealed class Keyword
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty; // Max 30 characters

    /// <summary>URL-friendly segment. When null, slug is derived from Name. Admin can update Name and Slug independently.</summary>
    public string? Slug { get; set; }

    public bool IsPrivate { get; set; } // Global (false) or Private (true)

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Indicates that this private keyword is awaiting admin review to potentially become public.
    /// Public keywords are never review-pending.
    /// </summary>
    public bool IsReviewPending { get; set; } = false;

    /// <summary>Timestamp when an admin approved or rejected this keyword. Null if never reviewed.</summary>
    public DateTime? ReviewedAt { get; set; }

    /// <summary>Identifier of the admin who last reviewed this keyword. Null if never reviewed.</summary>
    public string? ReviewedBy { get; set; }
}

