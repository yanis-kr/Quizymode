using System.Reflection;
using System.Text;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Options;
using Serilog;
using Serilog.Filters;
using Serilog.Settings.Configuration;
using Serilog.Sinks.Grafana.Loki;
using Serilog.Sinks.SystemConsole.Themes;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    internal static WebApplicationBuilder AddLoggingServices(this WebApplicationBuilder builder)
    {
        // Configure Grafana Cloud options
        builder.Services.Configure<GrafanaCloudOptions>(
            builder.Configuration.GetSection(GrafanaCloudOptions.SectionName));

        builder.Host.UseSerilog((context, services, configuration) =>
        {
            configuration
                .ReadFrom.Configuration(context.Configuration)
                .Filter.ByExcluding(logEvent =>
                {
                    // Exclude logs from health check categories
                    if (logEvent.Properties.TryGetValue("SourceContext", out var sourceContext))
                    {
                        string? source = sourceContext.ToString().Trim('"');
                        if (source.Contains("HealthChecks", StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }
                    }
                    
                    // Exclude logs for health check endpoints by checking request path property
                    if (logEvent.Properties.TryGetValue("RequestPath", out var requestPath))
                    {
                        string? path = requestPath.ToString().Trim('"');
                        if (path == "/health")
                        {
                            return true;
                        }
                    }
                    
                    // Exclude logs that mention health check endpoints in the message
                    string message = logEvent.RenderMessage();
                    return message.Contains("/health", StringComparison.OrdinalIgnoreCase);
                })
                .Enrich.FromLogContext()
                .Enrich.WithProperty("Application", "QuizyMode")
                .WriteTo.Console(theme: AnsiConsoleTheme.Code,
                                 outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}");

            // Add Grafana Loki sink if configured
            GrafanaCloudOptions? grafanaOptions = null;
            try
            {
                grafanaOptions = services.GetService<IOptions<GrafanaCloudOptions>>()?.Value;
            }
            catch
            {
                // Options not configured yet, will check via configuration directly
            }

            if (grafanaOptions is null)
            {
                grafanaOptions = new GrafanaCloudOptions
                {
                    Enabled = context.Configuration.GetValue<bool>($"{GrafanaCloudOptions.SectionName}:Enabled"),
                    LokiEndpoint = context.Configuration[$"{GrafanaCloudOptions.SectionName}:LokiEndpoint"] ?? string.Empty,
                    InstanceId = context.Configuration[$"{GrafanaCloudOptions.SectionName}:InstanceId"] ?? string.Empty,
                    ApiKey = context.Configuration[$"{GrafanaCloudOptions.SectionName}:ApiKey"] ?? string.Empty
                };
            }

            if (grafanaOptions.Enabled && 
                !string.IsNullOrWhiteSpace(grafanaOptions.LokiEndpoint) &&
                !string.IsNullOrWhiteSpace(grafanaOptions.InstanceId) &&
                !string.IsNullOrWhiteSpace(grafanaOptions.ApiKey))
            {
                // Construct Basic auth header for Grafana Cloud: base64(instanceId:apiKey)
                byte[] credentials = Encoding.UTF8.GetBytes($"{grafanaOptions.InstanceId}:{grafanaOptions.ApiKey}");
                string base64Credentials = Convert.ToBase64String(credentials);

                configuration.WriteTo.GrafanaLoki(
                    grafanaOptions.LokiEndpoint,
                    labels: new[]
                    {
                        new LokiLabel { Key = "application", Value = "QuizyMode" },
                        new LokiLabel { Key = "environment", Value = context.HostingEnvironment.EnvironmentName }
                    },
                    credentials: new LokiCredentials
                    {
                        Login = grafanaOptions.InstanceId,
                        Password = grafanaOptions.ApiKey
                    });
            }
        });

        return builder;
    }

    /// <summary>
    /// Use this method at the very start of the application to log startup information.
    /// </summary>
    internal static void StartupLogger()
    {
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Debug()
            .WriteTo.Console()
            .CreateLogger();

        Assembly assembly = Assembly.GetExecutingAssembly();
        string? fullVersion = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                             ?? assembly.GetName().Version?.ToString();
        
        // Extract version number only (remove commit hash after '+')
        string version = fullVersion is not null && fullVersion.Contains('+')
            ? fullVersion.Substring(0, fullVersion.IndexOf('+'))
            : fullVersion ?? "Unknown";

        Log.Information("*** Starting QuizyMode Web API v{Version}", version);
    }
}
