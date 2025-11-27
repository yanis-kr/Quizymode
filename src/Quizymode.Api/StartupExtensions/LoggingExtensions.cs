using System.Reflection;
using Serilog;
using Serilog.Filters;
using Serilog.Settings.Configuration;
using Serilog.Sinks.SystemConsole.Themes;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    internal static WebApplicationBuilder AddLoggingServices(this WebApplicationBuilder builder)
    {
        builder.Host.UseSerilog((context, configuration) =>
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
                        if (path == "/health" || path == "/alive")
                        {
                            return true;
                        }
                    }
                    
                    // Exclude logs that mention health check endpoints in the message
                    string message = logEvent.RenderMessage();
                    return message.Contains("/health", StringComparison.OrdinalIgnoreCase) 
                        || message.Contains("/alive", StringComparison.OrdinalIgnoreCase);
                })
                .Enrich.FromLogContext()
                .Enrich.WithProperty("Application", "QuizyMode")
                .WriteTo.Console(theme: AnsiConsoleTheme.Code,
                                 outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}");
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
