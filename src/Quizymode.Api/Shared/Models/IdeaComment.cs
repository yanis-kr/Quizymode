namespace Quizymode.Api.Shared.Models;

public sealed class IdeaComment
{
    public Guid Id { get; set; }

    public Guid IdeaId { get; set; }

    public string Text { get; set; } = string.Empty;

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}
