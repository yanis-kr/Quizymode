namespace Quizymode.Api.Shared.Models;

public sealed class Collection
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// When true, collection appears in discover search for other users.
    /// </summary>
    public bool IsPublic { get; set; }
}


