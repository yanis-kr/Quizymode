namespace Quizymode.Api.Shared.Models;

public sealed class Review
{
    public Guid Id { get; set; }

    public Guid ItemId { get; set; }

    public string Reaction { get; set; } = string.Empty;

    public string Comment { get; set; } = string.Empty;

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}


