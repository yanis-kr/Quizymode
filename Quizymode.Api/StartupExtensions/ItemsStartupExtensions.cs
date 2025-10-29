using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Features.Items.Delete;

namespace Quizymode.Api.StartupExtensions;

internal static class ItemsStartupExtensions
{
    public static WebApplicationBuilder AddItemsFeature(this WebApplicationBuilder builder)
    {
        builder.Services.AddScoped<GetItemsHandler>();
        builder.Services.AddScoped<AddItemsHandler>();
        builder.Services.AddScoped<DeleteItemsHandler>();
        
        return builder;
    }

    public static WebApplication MapItemsEndpoints(this WebApplication app)
    {
        app.MapGetItemsEndpoint();
        app.MapAddItemsEndpoint();
        app.MapDeleteItemsEndpoint();
        
        return app;
    }
}
