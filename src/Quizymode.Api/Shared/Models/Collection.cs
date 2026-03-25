namespace Quizymode.Api.Shared.Models;

public sealed class Collection
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Optional description to help find and identify the collection (e.g. in discover search).
    /// </summary>
    public string? Description { get; set; }

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// When true, collection appears in discover search for other users.
    /// </summary>
    public bool IsPublic { get; set; }
}


