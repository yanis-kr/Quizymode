using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>#781: the OTLP exporter must use the Grafana key from configuration (SSM), not a stale container variable.</summary>
[Collection("Environment variables")]
public sealed class GrafanaOtlpKeyTests
{
    private const string Canary = "glc_CANARY-not-a-real-token";

    [Fact]
    public void ConfigureOpenTelemetry_ExportsConfiguredKeyToGrafanaEnvironmentVariable()
    {
        string? previousKey = Environment.GetEnvironmentVariable("GRAFANA_CLOUD_API_KEY");
        string? previousHeaders = Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_HEADERS");
        try
        {
            Environment.SetEnvironmentVariable("GRAFANA_CLOUD_API_KEY", "stale-old-value");
            HostApplicationBuilder builder = Host.CreateApplicationBuilder();
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["GrafanaCloud:Enabled"] = "true",
                ["GrafanaCloud:OtlpEndpoint"] = "https://otlp.example.test",
                ["GrafanaCloud:OtlpInstanceId"] = "12345",
                ["GrafanaCloud:ApiKey"] = Canary,
            });

            builder.ConfigureOpenTelemetry();

            Environment.GetEnvironmentVariable("GRAFANA_CLOUD_API_KEY").Should().Be(Canary);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GRAFANA_CLOUD_API_KEY", previousKey);
            Environment.SetEnvironmentVariable("OTEL_EXPORTER_OTLP_HEADERS", previousHeaders);
        }
    }

    [Fact]
    public void ConfigureOpenTelemetry_LeavesTheVariableAloneWhenNoKeyIsConfigured()
    {
        string? previousKey = Environment.GetEnvironmentVariable("GRAFANA_CLOUD_API_KEY");
        try
        {
            Environment.SetEnvironmentVariable("GRAFANA_CLOUD_API_KEY", "kept-value");
            HostApplicationBuilder builder = Host.CreateApplicationBuilder();
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["GrafanaCloud:Enabled"] = "true" });

            builder.ConfigureOpenTelemetry();

            Environment.GetEnvironmentVariable("GRAFANA_CLOUD_API_KEY").Should().Be("kept-value");
        }
        finally
        {
            Environment.SetEnvironmentVariable("GRAFANA_CLOUD_API_KEY", previousKey);
        }
    }
}
