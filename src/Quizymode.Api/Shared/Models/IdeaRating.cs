namespace Quizymode.Api.Shared.Models;

public sealed class IdeaRating
{
    public Guid Id { get; set; }

    public Guid IdeaId { get; set; }

    public int? Stars { get; set; }

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}
