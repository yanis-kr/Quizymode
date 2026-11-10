namespace Quizymode.Api.Shared.Models;

/// <summary>
/// A topic member of a collection (#553): every public or visible question on the taxonomy path
/// Category / Keyword1 [/ Keyword2] belongs to the parent. Stores ids, not slugs, and has no foreign keys to the taxonomy,
/// so a deleted path stays here and shows as removed.
/// </summary>
public sealed class CollectionKeywordMember
{
    public Guid Id { get; set; }

    public Guid ParentId { get; set; }

    public Guid CategoryId { get; set; }

    public Guid Keyword1Id { get; set; }

    public Guid? Keyword2Id { get; set; }

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}
