namespace Quizymode.Api.Shared.Options;

internal sealed record class GitHubSeedSyncOptions
{
    public const string SectionName = "GitHubSeedSync";

    public string ApiBaseUrl { get; init; } = "https://api.github.com";

    public string RawBaseUrl { get; init; } = "https://raw.githubusercontent.com";

    public string BundlePath { get; init; } = "data/seed-source/_registry/items-bundle.json";

    public string? Token { get; init; }

    public string UserAgent { get; init; } = "Quizymode-SeedSync";
}
