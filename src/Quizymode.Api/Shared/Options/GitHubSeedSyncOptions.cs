namespace Quizymode.Api.Shared.Options;

internal sealed record class GitHubSeedSyncOptions
{
    public const string SectionName = "GitHubSeedSync";

    public string ApiBaseUrl { get; init; } = "https://api.github.com";

    public string RawBaseUrl { get; init; } = "https://raw.githubusercontent.com";

    /// <summary>Seed sync reads only this repository. A request naming any other is refused before any outbound call.</summary>
    public string AllowedRepositoryOwner { get; init; } = "yanis-kr";

    public string AllowedRepositoryName { get; init; } = "Quizymode";

    /// <summary>Source files listed in the index are fetched only from under this directory.</summary>
    public string SourceFilesRoot { get; init; } = "data/seed-source/";

    public string SourceFileIndexPath { get; init; } = "data/seed-source/_registry/source-file-index.json";

    public string CollectionsPath { get; init; } = "data/seed-source/collections/public";

    public string TaxonomyYamlPath { get; init; } = "docs/quizymode_taxonomy.yaml";

    public string? Token { get; init; }

    public string UserAgent { get; init; } = "Quizymode-SeedSync";
}
