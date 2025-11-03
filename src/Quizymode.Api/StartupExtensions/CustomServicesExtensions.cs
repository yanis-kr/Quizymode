using Quizymode.Api.Services;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddCustomServices(this WebApplicationBuilder builder)
    {
        // SimHashService is stateless, so it can be a singleton
        builder.Services.AddSingleton<ISimHashService, SimHashService>();
        return builder;
    }
}
