namespace Quizymode.Api.Shared.Options;

/// <summary>
/// Configuration options for Grafana Cloud integration.
/// </summary>
internal sealed record class GrafanaCloudOptions
{
    public const string SectionName = "GrafanaCloud";

    /// <summary>
    /// OTLP endpoint URL for traces and metrics (e.g., https://otlp-gateway-prod-us-central-0.grafana.net/otlp or https://tempo-prod-30-prod-us-east-3.grafana.net/tempo)
    /// </summary>
    public string OtlpEndpoint { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud instance ID for OTLP (traces/metrics). Can be different from Loki instance ID.
    /// </summary>
    public string OtlpInstanceId { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud API key/token for OTLP (traces/metrics)
    /// </summary>
    public string OtlpApiKey { get; init; } = string.Empty;

    /// <summary>
    /// Loki endpoint URL for logs (e.g., https://logs-prod-042.grafana.net)
    /// </summary>
    public string LokiEndpoint { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud instance ID for Loki (logs). Can be different from OTLP instance ID.
    /// </summary>
    public string LokiInstanceId { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud API key/token for Loki (logs)
    /// </summary>
    public string LokiApiKey { get; init; } = string.Empty;

    /// <summary>
    /// Legacy: Grafana Cloud instance ID (for backward compatibility, used if OtlpInstanceId/LokiInstanceId not set)
    /// </summary>
    public string InstanceId { get; init; } = string.Empty;

    /// <summary>
    /// Legacy: Grafana Cloud API key/token (for backward compatibility, used if OtlpApiKey/LokiApiKey not set)
    /// </summary>
    public string ApiKey { get; init; } = string.Empty;

    /// <summary>
    /// Whether Grafana Cloud integration is enabled
    /// </summary>
    public bool Enabled { get; init; } = false;
}

