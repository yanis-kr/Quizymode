namespace Quizymode.Api.Shared.Models;

/// <summary>
/// Represents a parent-child link between keywords within a category for navigation.
/// ParentKeywordId null = root (topic); otherwise child is a subtopic under that parent.
/// Same keyword can be child of multiple parents in the same category (e.g. "expressions" under English and Spanish).
/// </summary>
public sealed class KeywordRelation
{
    public Guid Id { get; set; }

    public Guid CategoryId { get; set; }

    /// <summary>Null = root/topic in this category; otherwise the parent keyword ID.</summary>
    public Guid? ParentKeywordId { get; set; }

    /// <summary>The keyword that is a child (topic or subtopic) in this relation.</summary>
    public Guid ChildKeywordId { get; set; }

    public int SortOrder { get; set; }

    public string? Description { get; set; }

    /// <summary>When true, this relation is visible only to CreatedBy until admin approves.</summary>
    public bool IsPrivate { get; set; }

    /// <summary>User who created the relation (e.g. from bulk insert). Null for admin-created public relations.</summary>
    public string? CreatedBy { get; set; }

    public bool IsReviewPending { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public string? ReviewedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Category Category { get; set; } = null!;
    public Keyword? ParentKeyword { get; set; }
    public Keyword ChildKeyword { get; set; } = null!;
}
