namespace Quizymode.Api.Shared.Models;

public sealed class SeedSyncItemHistory
{
    public Guid Id { get; set; }

    public Guid SeedSyncRunId { get; set; }

    public SeedSyncRun SeedSyncRun { get; set; } = null!;

    public Guid ItemId { get; set; }

    public SeedSyncItemHistoryAction Action { get; set; }

    public string Category { get; set; } = string.Empty;

    public string NavigationKeyword1 { get; set; } = string.Empty;

    public string NavigationKeyword2 { get; set; } = string.Empty;

    public string Question { get; set; } = string.Empty;

    public List<string> ChangedFields { get; set; } = [];

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
