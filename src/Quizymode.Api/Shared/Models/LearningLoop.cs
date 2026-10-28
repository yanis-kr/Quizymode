namespace Quizymode.Api.Shared.Models;

/// <summary>
/// One missed item in an authenticated learner's review queue (REVIEW-001, #117). (<see cref="UserId"/>,
/// <see cref="ItemId"/>) is the key. <see cref="ItemId"/> is intentionally not a foreign key: a deleted item is
/// dropped from the queue when it would be shown, without erasing history elsewhere.
/// </summary>
public sealed class ReviewQueueEntry
{
    public string UserId { get; set; } = string.Empty;

    public Guid ItemId { get; set; }

    /// <summary>Index into <c>ReviewSchedule.IntervalDays</c>; 0 is the one-day interval.</summary>
    public int IntervalIndex { get; set; }

    public DateTime DueAt { get; set; }

    /// <summary>The item's UpdatedAt (or CreatedAt) when the entry was last scheduled; a newer edit re-surfaces it.</summary>
    public DateTime ItemVersionAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? LastReviewedAt { get; set; }
}

/// <summary>
/// Header for a UTC date's daily quiz (DAILY-001, #119). Inserted together with the day's items; its key makes
/// concurrent first reads of a day race safely, and a header with no items records a day with nothing eligible.
/// </summary>
public sealed class DailyQuizSet
{
    public DateOnly Date { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>One item of the global daily quiz for a UTC date (DAILY-001, #119).</summary>
public sealed class DailyQuizItem
{
    public DateOnly Date { get; set; }

    public Guid ItemId { get; set; }

    /// <summary>Slot in the day's set (0-based). A replacement takes the slot of the item it replaces.</summary>
    public int Position { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set when an admin removed the item from that day's set; excluded rows are never reselected for the date.</summary>
    public DateTime? ExcludedAt { get; set; }

    public string? ExcludedBy { get; set; }
}

/// <summary>An authenticated user's completed daily quiz for a UTC date. First write wins.</summary>
public sealed class DailyQuizCompletion
{
    public string UserId { get; set; } = string.Empty;

    public DateOnly Date { get; set; }

    public int Correct { get; set; }

    public int Total { get; set; }

    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>An explicit public category or navigation path chosen by an authenticated user.</summary>
public sealed class UserInterest
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string UserId { get; set; } = string.Empty;

    /// <summary>Category reference; a deleted or now-private category is skipped when interests are read.</summary>
    public Guid CategoryId { get; set; }

    public Guid? NavigationKeywordId1 { get; set; }

    public Guid? NavigationKeywordId2 { get; set; }

    /// <summary>Order the user listed the interest in; explicit order ranks For you.</summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
