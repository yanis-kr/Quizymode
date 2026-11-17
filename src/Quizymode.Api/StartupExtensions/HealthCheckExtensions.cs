using Quizymode.Api.Services.Startup;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddHealthCheckServices(this WebApplicationBuilder builder)
    {
        // Readiness (#732): /health covers every check including this one; /alive covers only the "live" tag.
        builder.Services.AddHealthChecks()
            .AddCheck<StartupGateHealthCheck>(StartupGateHealthCheck.Name, tags: [StartupGateHealthCheck.ReadyTag]);
        return builder;
    }
}
