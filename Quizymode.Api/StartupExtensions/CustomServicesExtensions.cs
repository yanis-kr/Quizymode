using Quizymode.Api.Services;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddCustomServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddScoped<ISimHashService, SimHashService>();
        return builder;
    }
}
