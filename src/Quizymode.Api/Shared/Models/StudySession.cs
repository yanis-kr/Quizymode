namespace Quizymode.Api.Shared.Models;

/// <summary>
/// One completed quiz run saved to an authenticated user's private history (PROGRESS-001, #114).
/// (<see cref="UserId"/>, <see cref="RunId"/>) is the idempotency key. Only run-level facts are stored; no question or
/// answer text and no per-attempt audit trail.
/// </summary>
public sealed class StudySession
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    /// <summary>Client-generated run identifier; retries of the same run never create a second row.</summary>
    public string RunId { get; set; } = string.Empty;

    /// <summary><c>quiz</c> for a run recorded live, <c>guest-import</c> for unverified browser-local history (#115).</summary>
    public string Origin { get; set; } = StudySessionOrigins.Quiz;

    public DateTime CompletedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public int Correct { get; set; }

    public int Total { get; set; }

    /// <summary>collection, category, global, or null when the scope could not be described.</summary>
    public string? SourceKind { get; set; }

    public Guid? SourceCollectionId { get; set; }

    public string? SourceCategorySlug { get; set; }

    /// <summary>Comma-separated canonical keyword slugs (empty when none).</summary>
    public string NavigationKeywords { get; set; } = string.Empty;

    public string FilterKeywords { get; set; } = string.Empty;

    public List<StudySessionMissedItem> MissedItems { get; set; } = new();
}

public sealed class StudySessionMissedItem
{
    public Guid StudySessionId { get; set; }

    /// <summary>Item id reference; intentionally not a foreign key so deleting an item never erases score history.</summary>
    public Guid ItemId { get; set; }
}

public static class StudySessionOrigins
{
    public const string Quiz = "quiz";
    public const string GuestImport = "guest-import";
}
