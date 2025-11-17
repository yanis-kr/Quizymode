namespace Quizymode.Api.Shared.Models;

public sealed class CollectionItem
{
    public Guid Id { get; set; }

    public Guid CollectionId { get; set; }

    public Guid ItemId { get; set; }

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}


