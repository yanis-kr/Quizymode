using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections.Add;
using Quizymode.Api.Features.Collections.Get;

namespace Quizymode.Api.StartupExtensions;

internal static class CollectionsStartupExtensions
{
    public static WebApplicationBuilder AddCollectionsFeature(this WebApplicationBuilder builder)
    {
        builder.Services.AddScoped<GetCollectionsHandler>();
        builder.Services.AddScoped<AddCollectionsHandler>();
        builder.Services.AddScoped<GetCollectionItemsHandler>();
        
        return builder;
    }

    public static WebApplication MapCollectionsEndpoints(this WebApplication app)
    {
        app.MapGetCollectionsEndpoint();
        app.MapAddCollectionsEndpoint();
        app.MapGetCollectionItemsEndpoint();
        
        return app;
    }
}
