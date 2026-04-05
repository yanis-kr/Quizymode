namespace Quizymode.Api.Shared.Options;

internal sealed record class GitHubSeedSyncOptions
{
    public const string SectionName = "GitHubSeedSync";

    public string ApiBaseUrl { get; init; } = "https://api.github.com";

    public string DefaultItemsPath { get; init; } = "data/seed-source/items";

    public string? Token { get; init; }

    public string UserAgent { get; init; } = "Quizymode-SeedSync";
}
