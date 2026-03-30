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
            // Use full type name for schema IDs so "Request"/"Response" from different endpoints don't collide.
            // For generic types, Type.FullName embeds assembly-qualified names of type args (including Version=x.y.z),
            // which changes every release. Build a clean, version-stable name recursively instead.
            options.CreateSchemaReferenceId = (JsonTypeInfo typeInfo) => BuildSchemaId(typeInfo.Type);
        });

        return builder;
    }

    private static string? BuildSchemaId(Type type)
    {
        if (type.IsGenericTypeParameter) return null;

        if (!type.IsGenericType)
        {
            // Non-generic: FullName is version-stable (no assembly version embedded here)
            string? fullName = type.FullName;
            if (string.IsNullOrEmpty(fullName)) return null;
            return fullName.Replace('+', '.');
        }

        // Generic: build "Namespace.BaseTypeNameOfArg1AndArg2" without assembly version info.
        // We use the open generic definition's FullName (version-stable) and recurse into args.
        Type genericDef = type.GetGenericTypeDefinition();
        string baseName = (genericDef.FullName ?? genericDef.Name)
            .Replace('+', '.')
            .Split('`')[0]; // strip `1, `2 arity suffix

        string?[] argNames = type.GetGenericArguments()
            .Select(BuildSchemaId)
            .ToArray();

        if (argNames.Any(a => a is null)) return null;

        return $"{baseName}Of{string.Join("And", argNames)}";
    }
}
