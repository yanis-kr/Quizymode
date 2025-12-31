namespace Quizymode.Api.Shared.Options;

/// <summary>
/// Configuration options for Grafana Cloud integration.
/// </summary>
internal sealed record class GrafanaCloudOptions
{
    public const string SectionName = "GrafanaCloud";

    /// <summary>
    /// Whether Grafana Cloud integration is enabled
    /// </summary>
    public bool Enabled { get; init; } = false;

    /// <summary>
    /// OTLP endpoint URL for traces and metrics (e.g., https://otlp-gateway-prod-us-central-0.grafana.net/otlp)
    /// </summary>
    public string OtlpEndpoint { get; init; } = string.Empty;

    /// <summary>
    /// Loki endpoint URL for logs (e.g., https://logs-prod-us-east-3.grafana.net/loki/api/v1/push)
    /// </summary>
    public string LokiEndpoint { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud instance ID for OTLP (traces/metrics)
    /// </summary>
    public string OtlpInstanceId { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud instance ID for Loki (logs)
    /// </summary>
    public string LokiInstanceId { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud API key/token (used for both OTLP and Loki)
    /// </summary>
    public string ApiKey { get; init; } = string.Empty;
}

