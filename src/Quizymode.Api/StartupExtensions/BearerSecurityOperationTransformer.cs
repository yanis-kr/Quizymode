using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Quizymode.Api.StartupExtensions;

/// <summary>
/// Describes access per operation from the endpoint's own authorization metadata (documentation only; it changes
/// no runtime behavior). An operation that requires authorization lists only the Bearer requirement. An operation that
/// allows anonymous access (<c>AllowAnonymous</c>, or no authorization metadata at all) lists an empty requirement
/// (anonymous is accepted) next to the optional Bearer requirement, because the JWT handler still authenticates any
/// valid token sent to it and an anonymous endpoint may use that identity.
/// </summary>
internal sealed class BearerSecurityOperationTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
    {
        IList<object> metadata = context.Description.ActionDescriptor.EndpointMetadata;
        bool allowsAnonymous = metadata.OfType<IAllowAnonymous>().Any();
        bool requiresAuthorization = metadata.OfType<IAuthorizeData>().Any();

        List<OpenApiSecurityRequirement> requirements = new();
        if (allowsAnonymous || !requiresAuthorization)
        {
            requirements.Add(new OpenApiSecurityRequirement());
        }

        OpenApiSecurityRequirement bearer = new();
        bearer.Add(new OpenApiSecuritySchemeReference("Bearer", context.Document), new List<string>());
        requirements.Add(bearer);

        operation.Security = requirements;
        return Task.CompletedTask;
    }
}
