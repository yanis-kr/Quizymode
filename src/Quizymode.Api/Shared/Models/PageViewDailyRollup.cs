namespace Quizymode.Api.Shared.Models;

/// <summary>
/// One aggregate row of page-hit traffic for a single UTC day (ANALYTICS-011). Rows carry no
/// identifiers (no session id, visitor id, user id, IP address, or user agent), so they are kept
/// after raw <see cref="PageView"/> hits are pruned and serve long-range reports.
/// </summary>
/// <remarks>
/// Grain: Day x Area x ScopeType x ScopeKey x Channel x DeviceClass x Country x Outcome x VisitorType.
/// Three row kinds per day, so session counts can always be read without double counting:
/// <list type="bullet">
/// <item><see cref="Area"/> = <c>all</c>: session totals (each session counted once for the day);</item>
/// <item><see cref="ScopeType"/> = <c>all</c>: per-area totals (a session counted once per area it touched);</item>
/// <item>otherwise: per-area, per-scope breakdown (a null scope means unscoped hits in that area).</item>
/// </list>
/// </remarks>
public sealed class PageViewDailyRollup
{
    public Guid Id { get; set; }

    public DateOnly Day { get; set; }

    /// <summary>Feature area, or <c>all</c> for the session-level total row.</summary>
    public string Area { get; set; } = string.Empty;

    /// <summary>
    /// category or collection; <c>all</c> on per-area total rows; null for unscoped hits and session
    /// totals (item scope is not kept, to bound row count).
    /// </summary>
    public string? ScopeType { get; set; }

    public string? ScopeKey { get; set; }

    /// <summary>Session channel from the attribution snapshot, or <c>unknown</c>.</summary>
    public string Channel { get; set; } = string.Empty;

    public string DeviceClass { get; set; } = string.Empty;

    public string? Country { get; set; }

    /// <summary>anonymous, converted, or authenticated, judged on the session's hits that day.</summary>
    public string Outcome { get; set; } = string.Empty;

    /// <summary>new, returning, or unknown (no visitor id).</summary>
    public string VisitorType { get; set; } = string.Empty;

    public int Hits { get; set; }

    public int Sessions { get; set; }

    public int ItemSteps { get; set; }

    /// <summary>Sessions with exactly one hit that day; populated on <c>all</c> rows only.</summary>
    public int BouncedSessions { get; set; }

    public DateTime CreatedUtc { get; set; }
}
