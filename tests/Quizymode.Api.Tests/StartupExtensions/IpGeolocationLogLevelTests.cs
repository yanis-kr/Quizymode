using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Serilog;
using Serilog.Core;
using Serilog.Events;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>
/// #490 owner decision 5 follow-up (AC 5.12.24): the ipinfo.io geolocation HttpClient is set to Warning, so it stays out of
/// production Information logs. Reads the real src/Quizymode.Api/appsettings.json so the test fails if the override is removed.
/// </summary>
public sealed class IpGeolocationLogLevelTests
{
    private const string IpGeolocationSource = "System.Net.Http.HttpClient.ipgeolocation.ClientHandler";

    [Fact]
    public void IpGeolocationHttpLogs_AtInformation_AreDropped_ButWarningsAndAppInformationPass()
    {
        string appSettingsPath = FindAppSettings();
        IConfiguration configuration = new ConfigurationBuilder().AddJsonFile(appSettingsPath, optional: false).Build();

        List<LogEvent> events = [];
        using Logger logger = new LoggerConfiguration()
            .ReadFrom.Configuration(configuration)
            .WriteTo.Sink(new ListSink(events))
            .CreateLogger();

        logger.ForContext("SourceContext", IpGeolocationSource).Information("Start processing HTTP request GET https://ipinfo.io/x/json");
        logger.ForContext("SourceContext", IpGeolocationSource).Warning("Geolocation HTTP call failed");
        logger.ForContext("SourceContext", "Quizymode.Api.Services.IpGeolocationService").Information("App line");

        events.Select(e => e.MessageTemplate.Text).Should().NotContain(t => t.StartsWith("Start processing"),
            "ipgeolocation Information lines must be dropped (AC 5.12.24)");
        events.Should().ContainSingle(e => e.Level == LogEventLevel.Warning && e.MessageTemplate.Text == "Geolocation HTTP call failed",
            "ipgeolocation Warning lines still reach production logs");
        events.Should().ContainSingle(e => e.MessageTemplate.Text == "App line",
            "app Information lines are unchanged");
    }

    private static string FindAppSettings()
    {
        DirectoryInfo? dir = new(AppContext.BaseDirectory);
        while (dir is not null)
        {
            string candidate = Path.Combine(dir.FullName, "src", "Quizymode.Api", "appsettings.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        throw new FileNotFoundException("Could not locate src/Quizymode.Api/appsettings.json from the test output directory.");
    }

    private sealed class ListSink(List<LogEvent> events) : ILogEventSink
    {
        public void Emit(LogEvent logEvent) => events.Add(logEvent);
    }
}
