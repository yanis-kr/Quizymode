namespace Quizymode.Api.Shared.Models;

public sealed class Rating
{
    public Guid Id { get; set; }

    public Guid ItemId { get; set; }

    public int? Stars { get; set; } // null or 1-5

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}

