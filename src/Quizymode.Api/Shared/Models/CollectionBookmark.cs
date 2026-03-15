namespace Quizymode.Api.Shared.Models;

public sealed class CollectionBookmark
{
    public Guid Id { get; set; }

    /// <summary>
    /// User who bookmarked (matches User.Id as string or auth subject).
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    public Guid CollectionId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
