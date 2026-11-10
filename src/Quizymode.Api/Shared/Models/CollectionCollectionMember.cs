namespace Quizymode.Api.Shared.Models;

/// <summary>A nested collection: <see cref="ChildId"/> is a member of <see cref="ParentId"/> (#552).</summary>
public sealed class CollectionCollectionMember
{
    public Guid Id { get; set; }

    public Guid ParentId { get; set; }

    public Guid ChildId { get; set; }

    public int SortOrder { get; set; }

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}
