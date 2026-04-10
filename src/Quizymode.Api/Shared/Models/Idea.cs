namespace Quizymode.Api.Shared.Models;

public sealed class Idea
{
    public Guid Id { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Problem { get; set; } = string.Empty;

    public string ProposedChange { get; set; } = string.Empty;

    public string? TradeOffs { get; set; }

    public IdeaStatus Status { get; set; } = IdeaStatus.Proposed;

    public IdeaModerationState ModerationState { get; set; } = IdeaModerationState.PendingReview;

    public string? ModerationNotes { get; set; }

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public string? ReviewedBy { get; set; }

    public DateTime? ReviewedAt { get; set; }
}
