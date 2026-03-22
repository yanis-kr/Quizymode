namespace Quizymode.Api.Shared.Options;

public sealed class TaxonomyOptions
{
    public const string SectionName = "Taxonomy";

    /// <summary>Relative to content root unless absolute.</summary>
    public string YamlRelativePath { get; init; } = Path.Combine("data", "taxonomy", "quizymode_taxonomy.yaml");
}
