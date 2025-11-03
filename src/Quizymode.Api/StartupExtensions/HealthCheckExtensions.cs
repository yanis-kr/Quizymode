namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddHealthCheckServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddHealthChecks();
        return builder;
    }
}
