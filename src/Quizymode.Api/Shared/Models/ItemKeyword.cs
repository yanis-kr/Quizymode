namespace Quizymode.Api.Shared.Models;

public sealed class ItemKeyword
{
    public Guid Id { get; set; }

    public Guid ItemId { get; set; }

    public Guid KeywordId { get; set; }

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public Keyword Keyword { get; set; } = null!;
}

