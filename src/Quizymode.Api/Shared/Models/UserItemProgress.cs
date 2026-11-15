namespace Quizymode.Api.Shared.Models;

/// <summary>
/// Per-user, per-item "known" flag behind signed-in set progress (#685). (<see cref="UserId"/>, <see cref="ItemId"/>) is the key.
/// <see cref="ItemId"/> is intentionally not a foreign key, so deleting an item never needs to touch progress; readers join to
/// the item and a deleted or no longer visible item simply stops counting. Only written for live quiz answers and review answers.
/// </summary>
public sealed class UserItemProgress
{
    public string UserId { get; set; } = string.Empty;

    public Guid ItemId { get; set; }

    /// <summary>True after the latest scored answer was correct; a later wrong answer sets it back to false.</summary>
    public bool IsKnown { get; set; }

    public DateTime? LastCorrectAt { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
