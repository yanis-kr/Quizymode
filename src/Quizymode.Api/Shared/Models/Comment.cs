namespace Quizymode.Api.Shared.Models;

public sealed class Comment
{
    public Guid Id { get; set; }

    public Guid ItemId { get; set; }

    public string Text { get; set; } = string.Empty;

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}

