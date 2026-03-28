namespace Quizymode.Api.Shared.Models;

public sealed class FeedbackSubmission
{
    public Guid Id { get; set; }

    public string Type { get; set; } = string.Empty;

    public string PageUrl { get; set; } = string.Empty;

    public string Details { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? AdditionalKeywords { get; set; }

    public Guid? UserId { get; set; }

    public string? UserAgent { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
