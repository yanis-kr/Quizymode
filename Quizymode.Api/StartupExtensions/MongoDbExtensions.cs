using Quizymode.Api.Data;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddMongoDbServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddSingleton<MongoDbContext>();
        builder.Services.AddHostedService<Services.DatabaseSeederHostedService>();
        return builder;
    }
}
