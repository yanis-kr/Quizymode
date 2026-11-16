namespace Quizymode.Api.Shared.Options;

public sealed class TaxonomyOptions
{
    public const string SectionName = "Taxonomy";

    /// <summary>Relative to content root unless absolute.</summary>
    public string YamlRelativePath { get; init; } = Path.Combine("data", "taxonomy", "quizymode_taxonomy.yaml");

    /// <summary>Generated bulk seed for categories, public keywords, and keyword relations (run tools/Quizymode.TaxonomySqlGen after YAML edits).</summary>
    public string SeedSqlRelativePath { get; init; } = Path.Combine("data", "taxonomy", "quizymode_taxonomy_seed.sql");

    /// <summary>
    /// Re-runs the taxonomy seed SQL even when its SHA-256 matches the stored one (#732). Set <c>Taxonomy:ForceSeed=true</c>
    /// for one boot to revert manual edits to category rows.
    /// </summary>
    public bool ForceSeed { get; init; }
}
