namespace Quizymode.Api.Shared.Models;

/// <summary>
/// One allowlisted engagement event (FUNNEL-001). Kept separate from <see cref="PageView"/> and limited
/// to bounded context fields: no question/answer text, emails, tokens, or arbitrary client payloads.
/// </summary>
public sealed class AnalyticsEvent
{
    public Guid Id { get; set; }

    public string EventName { get; set; } = string.Empty;

    /// <summary>The same tab-scoped id the page-view tracker sends, so events join to page hits.</summary>
    public string SessionId { get; set; } = string.Empty;

    public Guid? UserId { get; set; }

    public bool IsAuthenticated { get; set; }

    /// <summary>App-relative path without the query string.</summary>
    public string Path { get; set; } = string.Empty;

    public string? ContextType { get; set; }

    public string? ContextId { get; set; }

    /// <summary>Client-generated id of one quiz/flashcards run; required for run-scoped events.</summary>
    public string? RunId { get; set; }

    /// <summary>Reserved for item-level study events (ANALYTICS-007).</summary>
    public Guid? ItemId { get; set; }

    public int? Position { get; set; }

    public bool? IsCorrect { get; set; }

    public int? Score { get; set; }

    public int? Total { get; set; }

    /// <summary>
    /// Server-derived idempotency key, unique per session. Run-scoped events use the run id so a
    /// retried or re-rendered completion is stored once; impression events use the client event id.
    /// </summary>
    public string? DedupeKey { get; set; }

    public string? UserAgent { get; set; }

    public bool IsBot { get; set; }

    /// <summary>Set at write time for admins, users flagged internal, and browsers sending the internal marker.</summary>
    public bool IsInternal { get; set; }

    /// <summary>Assigned by the server; client clocks are not trusted.</summary>
    public DateTime OccurredUtc { get; set; } = DateTime.UtcNow;
}
