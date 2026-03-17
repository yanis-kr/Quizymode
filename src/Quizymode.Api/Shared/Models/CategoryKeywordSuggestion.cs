namespace Quizymode.Api.Shared.Models;

/// <summary>
/// Suggests that a keyword should become a navigation keyword (rank-1 or rank-2) for a category.
/// Created automatically when users use keywords as topics/subtopics that aren't yet in navigation.
/// Admins can approve or reject suggestions.
/// </summary>
public sealed class CategoryKeywordSuggestion
{
    public Guid Id { get; set; }

    public Guid CategoryId { get; set; }

    public Guid KeywordId { get; set; }

    /// <summary>
    /// Requested navigation rank: 1 (primary topic) or 2 (subtopic).
    /// </summary>
    public int RequestedRank { get; set; }

    /// <summary>
    /// For rank-2 suggestions, the requested parent keyword name (rank-1).
    /// Null for rank-1 suggestions.
    /// </summary>
    public string? RequestedParentName { get; set; }

    public string RequestedBy { get; set; } = string.Empty;

    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    public string Status { get; set; } = "Pending"; // Pending, Approved, Rejected

    public DateTime? ReviewedAt { get; set; }

    public string? ReviewedBy { get; set; }

    public string? ReviewNotes { get; set; }

    public Category Category { get; set; } = null!;
    public Keyword Keyword { get; set; } = null!;
}

