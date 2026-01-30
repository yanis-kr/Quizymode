namespace Quizymode.Api.Shared.Models;

/// <summary>
/// Represents navigation metadata for a keyword within a specific category.
/// Keywords can participate in navigation (NavigationRank = 1 or 2) or be just tags (NavigationRank = null).
/// Rank 1 keywords are first-level navigation under a category.
/// Rank 2 keywords are children of a rank-1 keyword (via ParentName) and only make sense under that parent.
/// </summary>
public sealed class CategoryKeyword
{
    public Guid Id { get; set; }

    public Guid CategoryId { get; set; }

    public Guid KeywordId { get; set; }

    /// <summary>
    /// Navigation rank: 1 for first-level navigation, 2 for second-level (child of rank-1).
    /// Null means the keyword is not part of navigation, just a tag.
    /// </summary>
    public int? NavigationRank { get; set; }

    /// <summary>
    /// For rank-2 keywords, the name of the parent rank-1 keyword.
    /// Must be null for rank-1 keywords.
    /// </summary>
    public string? ParentName { get; set; }

    /// <summary>
    /// Sort order for displaying keywords in navigation (lower values appear first).
    /// </summary>
    public int SortRank { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Category Category { get; set; } = null!;
    public Keyword Keyword { get; set; } = null!;
}
