using System.Reflection;
using Serilog;
using Serilog.Sinks.SystemConsole.Themes;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    internal static WebApplicationBuilder AddLoggingServices(this WebApplicationBuilder builder)
    {
        builder.Host.UseSerilog((context, configuration) =>
        {
            configuration
                .MinimumLevel.Debug()
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
