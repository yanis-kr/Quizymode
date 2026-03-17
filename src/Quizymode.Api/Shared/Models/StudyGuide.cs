namespace Quizymode.Api.Shared.Models;

/// <summary>
/// One private study guide per user. Content is pasted text; total size limited to 100 KB per user.
/// </summary>
public sealed class StudyGuide
{
    public Guid Id { get; set; }

    /// <summary>
    /// User ID (string) of the owner.
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Raw pasted study guide text.
    /// </summary>
    public string ContentText { get; set; } = string.Empty;

    /// <summary>
    /// UTF-8 byte length of ContentText; used to enforce 100 KB limit.
    /// </summary>
    public int SizeBytes { get; set; }

    public DateTime CreatedUtc { get; set; }

    public DateTime UpdatedUtc { get; set; }
}
