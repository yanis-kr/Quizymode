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

    /// <summary>Analytics session the submission was sent from, when known (ANALYTICS-006).</summary>
    public string? SessionId { get; set; }

    /// <summary>Triage state: New, Reviewed, or Archived (see <see cref="FeedbackStatus"/>).</summary>
    public string Status { get; set; } = FeedbackStatus.New;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
