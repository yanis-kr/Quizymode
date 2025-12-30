namespace Quizymode.Api.Shared.Options;

/// <summary>
/// Configuration options for Grafana Cloud integration.
/// </summary>
internal sealed record class GrafanaCloudOptions
{
    public const string SectionName = "GrafanaCloud";

    /// <summary>
    /// OTLP endpoint URL for traces and metrics (e.g., https://otlp-gateway-prod-us-central-0.grafana.net/otlp)
    /// </summary>
    public string OtlpEndpoint { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud instance ID
    /// </summary>
    public string InstanceId { get; init; } = string.Empty;

    /// <summary>
    /// Grafana Cloud API key/token
    /// </summary>
    public string ApiKey { get; init; } = string.Empty;

    /// <summary>
    /// Loki endpoint URL for logs (e.g., https://logs-prod-us-central-0.grafana.net/loki/api/v1/push)
    /// </summary>
    public string LokiEndpoint { get; init; } = string.Empty;

    /// <summary>
    /// Whether Grafana Cloud integration is enabled
    /// </summary>
    public bool Enabled { get; init; } = false;
}

