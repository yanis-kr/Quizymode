namespace Quizymode.Api.Shared.Models;

public sealed class SeedSyncRun
{
    public Guid Id { get; set; }

    public string RepositoryOwner { get; set; } = string.Empty;

    public string RepositoryName { get; set; } = string.Empty;

    public string GitRef { get; set; } = string.Empty;

    public string ResolvedCommitSha { get; set; } = string.Empty;

    public string ItemsPath { get; set; } = string.Empty;

    public string SeedSet { get; set; } = string.Empty;

    public int SourceFileCount { get; set; }

    public int TotalItemsInPayload { get; set; }

    public int ExistingItemCount { get; set; }

    public int CreatedCount { get; set; }

    public int UpdatedCount { get; set; }

    public int DeletedCount { get; set; }

    public int UnchangedCount { get; set; }

    public string? TriggeredByUserId { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public List<SeedSyncItemHistory> ItemHistories { get; set; } = [];
}
