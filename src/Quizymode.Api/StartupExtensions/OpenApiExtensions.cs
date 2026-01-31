using System.Text.Json.Serialization.Metadata;
using Microsoft.AspNetCore.OpenApi;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddOpenApiServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer<BearerAuthOpenApiTransformer>();
            // Use full type name for schema IDs so "Request"/"Response" from different endpoints don't collide
            options.CreateSchemaReferenceId = (JsonTypeInfo typeInfo) =>
            {
                string? fullName = typeInfo.Type.FullName;
                if (string.IsNullOrEmpty(fullName)) return null;
                return fullName.Replace('+', '.');
            };
        });

        return builder;
    }
}
