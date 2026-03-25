namespace Quizymode.Api.Shared.Models;

/// <summary>
/// One rating per user per collection. Any authenticated user (including owner) can rate once; updates replace.
/// </summary>
public sealed class CollectionRating
{
    public Guid Id { get; set; }

    public Guid CollectionId { get; set; }

    /// <summary>1-5 stars.</summary>
    public int Stars { get; set; }

    /// <summary>User who gave the rating (UserId from auth).</summary>
    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}
