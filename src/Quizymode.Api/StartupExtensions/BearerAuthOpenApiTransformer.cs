using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Quizymode.Api.StartupExtensions;

internal sealed class BearerAuthOpenApiTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
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

        // Add global security requirement
        document.Security ??= new List<OpenApiSecurityRequirement>();
        OpenApiSecurityRequirement securityRequirement = new();
        securityRequirement.Add(
            new OpenApiSecuritySchemeReference("Bearer", document),
            new List<string>());
        document.Security.Add(securityRequirement);

        return Task.CompletedTask;
    }
}
