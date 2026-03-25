namespace Quizymode.Api.Shared.Models;

public sealed class CollectionShare
{
    public Guid Id { get; set; }

    public Guid CollectionId { get; set; }

    /// <summary>
    /// User who shared (owner).
    /// </summary>
    public string SharedBy { get; set; } = string.Empty;

    /// <summary>
    /// Recipient user id (if they have an account). Null when shared by email only.
    /// </summary>
    public string? SharedWithUserId { get; set; }

    /// <summary>
    /// Recipient email (for invite or when user not yet resolved).
    /// </summary>
    public string? SharedWithEmail { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
