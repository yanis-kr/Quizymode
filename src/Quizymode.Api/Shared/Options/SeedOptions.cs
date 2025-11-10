namespace Quizymode.Api.Shared.Options;

internal sealed record class SeedOptions
{
    public const string SectionName = "Seed";

    public string Path { get; init; } = string.Empty;
}

