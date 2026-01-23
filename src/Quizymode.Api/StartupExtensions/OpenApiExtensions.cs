using Microsoft.AspNetCore.OpenApi;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddOpenApiServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddOpenApi(options =>
            options.AddDocumentTransformer<BearerAuthOpenApiTransformer>());

        return builder;
    }
}
