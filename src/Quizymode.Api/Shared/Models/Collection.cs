namespace Quizymode.Api.Shared.Models;

public sealed class Collection
{
    public Guid Id { get; set; }

    public bool IsRepoManaged { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Optional description to help find and identify the collection (e.g. in discover search).
    /// </summary>
    public string? Description { get; set; }

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// When true, anyone with the link (collection id) can view the collection.
    /// </summary>
    public bool IsPublic { get; set; }

    /// <summary>
    /// When true (and <see cref="IsPublic"/> is true), the collection is listed in Discover search for other users.
    /// Always false when the collection is not public.
    /// </summary>
    public bool IsDiscoverable { get; set; }
}


