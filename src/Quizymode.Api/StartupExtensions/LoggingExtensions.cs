using System.Reflection;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Options;
using Serilog;
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
                    
                    // Get message once for reuse
                    string message = logEvent.RenderMessage();
                    
                    // Exclude EF Core migration history errors - these are expected when the table doesn't exist yet
                    // EventId 20102 is Microsoft.EntityFrameworkCore.Database.Command.CommandError
                    if (logEvent.Properties.TryGetValue("EventId", out var eventId))
                    {
                        string? eventIdStr = eventId.ToString();
                        if (eventIdStr.Contains("20102", StringComparison.OrdinalIgnoreCase))
                        {
                            // Filter out errors about __EFMigrationsHistory table not existing
                            // This is expected behavior when migrations run on a fresh database
                            if (message.Contains("__EFMigrationsHistory", StringComparison.OrdinalIgnoreCase) ||
                                message.Contains("relation \"__EFMigrationsHistory\" does not exist", StringComparison.OrdinalIgnoreCase))
                            {
                                return true;
                            }
                        }
                    }
                    
                    // Exclude logs that mention health check endpoints in the message
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
                    OtlpEndpoint = context.Configuration[$"{GrafanaCloudOptions.SectionName}:OtlpEndpoint"] ?? string.Empty,
                    LokiEndpoint = context.Configuration[$"{GrafanaCloudOptions.SectionName}:LokiEndpoint"] ?? string.Empty,
                    OtlpInstanceId = context.Configuration[$"{GrafanaCloudOptions.SectionName}:OtlpInstanceId"] ?? string.Empty,
                    LokiInstanceId = context.Configuration[$"{GrafanaCloudOptions.SectionName}:LokiInstanceId"] ?? string.Empty,
                    ApiKey = context.Configuration[$"{GrafanaCloudOptions.SectionName}:ApiKey"] ?? string.Empty
                };
            }

            if (grafanaOptions.Enabled && 
                !string.IsNullOrWhiteSpace(grafanaOptions.LokiEndpoint) &&
                !string.IsNullOrWhiteSpace(grafanaOptions.LokiInstanceId) &&
                !string.IsNullOrWhiteSpace(grafanaOptions.ApiKey))
            {
                configuration.WriteTo.GrafanaLoki(
                    grafanaOptions.LokiEndpoint,
                    labels: new[]
                    {
                        new LokiLabel { Key = "application", Value = "QuizyMode" },
                        new LokiLabel { Key = "environment", Value = context.HostingEnvironment.EnvironmentName }
                    },
                    credentials: new LokiCredentials
                    {
                        Login = grafanaOptions.LokiInstanceId,
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
