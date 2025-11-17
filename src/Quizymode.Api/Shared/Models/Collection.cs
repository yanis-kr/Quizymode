namespace Quizymode.Api.Shared.Models;

public sealed class Collection
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}


