namespace Quizymode.Api.Services.Taxonomy.Suggestions;

/// <summary>
/// Settings for non-LLM topic suggestion (#322), bound from the <c>TopicSuggestions</c> section. The scoring defaults
/// are the values selected by the opt-in evaluation test (<c>QM_TOPIC_EVAL=1</c>); the loading defaults bound the
/// database egress the item profiles may cost (AC 8.5).
/// </summary>
internal sealed class TopicSuggestionOptions
{
    public const string SectionName = "TopicSuggestions";

    /// <summary>BM25 term-frequency saturation.</summary>
    public double K1 { get; set; } = 1.2;

    /// <summary>BM25 length normalization.</summary>
    public double B { get; set; } = 0.75;

    /// <summary>Weight of the L2 score in the path score.</summary>
    public double Alpha { get; set; } = 0.5;

    /// <summary>Weight of the parent L1 score in the path score (the L2 to L1 roll-up).</summary>
    public double Beta { get; set; } = 0.35;

    /// <summary>Weight of the category score in the path score.</summary>
    public double Gamma { get; set; } = 0.15;

    /// <summary>Taxonomy slug tokens count this many times in a node document.</summary>
    public double SlugWeight { get; set; } = 3;

    /// <summary>Taxonomy description tokens count this many times in a node document.</summary>
    public double DescriptionWeight { get; set; } = 2;

    /// <summary>Below this share of the maximum achievable BM25 score the request falls back to yours/popular.</summary>
    public double ConfidenceThreshold { get; set; } = 0.08;

    /// <summary>A chip scoring below this share of the best chip is dropped.</summary>
    public double MinRelativeScore { get; set; } = 0.25;

    /// <summary>Fewer distinct analyzed terms than this falls back.</summary>
    public int MinTerms { get; set; } = 2;

    /// <summary>Distinct analyzed terms kept per query.</summary>
    public int MaxQueryTerms { get; set; } = 200;

    /// <summary>Characters of each item's explanation that feed its profile (the largest column, so the egress lever).</summary>
    public int ExplanationCap { get; set; } = 500;

    /// <summary>Minimum time between item-profile reloads caused by data changes (a seed-sync invalidation bypasses it).</summary>
    public TimeSpan MinReloadInterval { get; set; } = TimeSpan.FromHours(12);

    /// <summary>Hard cap on item-profile loads (including failed ones) in any rolling 24 hours.</summary>
    public int MaxLoadsPerDay { get; set; } = 4;

    /// <summary>How often the cheap one-row fingerprint query may run.</summary>
    public TimeSpan FingerprintInterval { get; set; } = TimeSpan.FromHours(1);

    /// <summary>A model older than this is stale even when the fingerprint is unchanged.</summary>
    public TimeSpan MaxModelAge { get; set; } = TimeSpan.FromDays(7);

    /// <summary>Wait after a failed load before another attempt.</summary>
    public TimeSpan FailureRetry { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>Timeout of the inline fingerprint query.</summary>
    public TimeSpan FingerprintTimeout { get; set; } = TimeSpan.FromSeconds(3);

    /// <summary>How long a user's own recent paths are cached.</summary>
    public TimeSpan YoursCacheTtl { get; set; } = TimeSpan.FromMinutes(5);
}
