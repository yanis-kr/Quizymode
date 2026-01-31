namespace Quizymode.Api.Shared.Models;

/// <summary>
/// Records an upload (e.g. JSON paste) for deduplication and linking items to the upload batch.
/// Hash is used to prevent multiple uploads of the same content by the same user.
/// </summary>
public sealed class Upload
{
    public Guid Id { get; set; }

    /// <summary>
    /// Raw input text (e.g. JSON string) that was uploaded.
    /// </summary>
    public string InputText { get; set; } = string.Empty;

    public Guid UserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Hash of InputText (e.g. SHA256) for duplicate detection per user.
    /// </summary>
    public string Hash { get; set; } = string.Empty;
}
