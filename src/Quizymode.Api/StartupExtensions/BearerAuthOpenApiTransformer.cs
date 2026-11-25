using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Quizymode.Api.StartupExtensions;

internal sealed class BearerAuthOpenApiTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        // Configure OpenAPI Info metadata
        document.Info ??= new OpenApiInfo();
        document.Info.Title = "Quizymode API";
        document.Info.Version = "v1";
        document.Info.Description = "Quizymode API with JWT Bearer authentication support";

        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();

        // Add Bearer security scheme
        document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "JWT Authorization header using the Bearer scheme. Example: \"Bearer {token}\""
        };

        // Security requirements are set per operation by BearerSecurityOperationTransformer, not globally.

        return Task.CompletedTask;
    }
}
