namespace Quizymode.Api.Shared.Options;

internal sealed record class GitHubSeedSyncOptions
{
    public const string SectionName = "GitHubSeedSync";

    public string ApiBaseUrl { get; init; } = "https://api.github.com";

    public string RawBaseUrl { get; init; } = "https://raw.githubusercontent.com";

    public string SourceFileIndexPath { get; init; } = "data/seed-source/_registry/source-file-index.json";

    public string CollectionsPath { get; init; } = "data/seed-source/collections/public";

    public string TaxonomyYamlPath { get; init; } = "docs/quizymode_taxonomy.yaml";

    public string TaxonomySeedSqlPath { get; init; } = "docs/quizymode_taxonomy_seed.sql";

    public string? Token { get; init; }

    public string UserAgent { get; init; } = "Quizymode-SeedSync";
}
