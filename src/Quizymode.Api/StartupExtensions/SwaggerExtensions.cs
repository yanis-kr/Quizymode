//using Microsoft.OpenApi.Models;
//using Microsoft.OpenApi.Any;
//using Microsoft.OpenApi.Interfaces;

//namespace Quizymode.Api.StartupExtensions;

//internal static partial class StartupExtensions
//{
//    public static WebApplicationBuilder AddSwaggerServices(this WebApplicationBuilder builder)
//    {
//        builder.Services.AddEndpointsApiExplorer();
//        builder.Services.AddOpenApi("v1", options =>
//        {
//            options.DocumentFilter<SwaggerDocumentFilter>();

//            options.AddSecurity("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
//            {
//                Name = "Authorization",
//                Type = SecuritySchemeType.Http,
//                Scheme = "Bearer",
//                BearerFormat = "JWT",
//                In = ParameterLocation.Header,
//                Description = "JWT Authorization header using the Bearer scheme. Example: \"Bearer {token}\""
//            });
//        });

//        return builder;
//    }
//}

//public class SwaggerDocumentFilter : IDocumentFilter
//{
//    public void Apply(OpenApiDocument document, DocumentFilterContext context)
//    {
//        document.Info = new OpenApiInfo
//        {
//            Title = "Quizymode API",
//            Version = "v1",
//            Description = "Quizymode Web API with JWT Bearer authentication (Cognito)."
//        };

//        document.Components ??= new OpenApiComponents();

//        // Generate schemas and rename if necessary
//        var schemaRenames = new Dictionary<string, string>();
//        RenameSchemas(document, schemaRenames);

//        // Update all references to renamed schemas
//        UpdateSchemaReferences(document, schemaRenames);
//    }

//    private static void RenameSchemas(OpenApiDocument document, Dictionary<string, string> schemaRenames)
//    {
//        if (document.Components?.Schemas is null)
//        {
//            return;
//        }

//        // Map of old schema names to new meaningful names
//        Dictionary<string, string> schemaRenamesTemp = new();

//        // Build mapping based on endpoint paths
//        if (document.Paths is not null)
//        {
//            foreach (KeyValuePair<string, OpenApiPathItem> path in document.Paths)
//            {
//                string pathKey = path.Key;
//                OpenApiPathItem pathItem = path.Value;

//                // Process each operation
//                if (pathItem.Operations is not null)
//                {
//                    foreach (KeyValuePair<OperationType, OpenApiOperation> operation in pathItem.Operations)
//                    {
//                        ProcessOperation(operation.Value, pathKey, operation.Key.ToString(), schemaRenamesTemp);
//                    }
//                }
//            }
//        }

//        // Apply renames
//        foreach (KeyValuePair<string, string> rename in schemaRenamesTemp)
//        {
//            if (document.Components.Schemas.ContainsKey(rename.Key) &&
//                !document.Components.Schemas.ContainsKey(rename.Value))
//            {
//                OpenApiSchema? schema = document.Components.Schemas[rename.Key];
//                document.Components.Schemas.Remove(rename.Key);
//                document.Components.Schemas[rename.Value] = schema;
//            }
//        }

//        // Update all references to renamed schemas
//        UpdateSchemaReferences(document, schemaRenamesTemp);
//    }

//    private static void ProcessOperation(
//        OpenApiOperation? operation,
//        string path,
//        string method,
//        Dictionary<string, string> schemaRenames)
//    {
//        if (operation is null)
//        {
//            return;
//        }

//        // Process responses
//        if (operation.Responses is not null)
//        {
//            foreach (KeyValuePair<string, OpenApiResponse> response in operation.Responses)
//            {
//                if (response.Value.Content is not null)
//                {
//                    foreach (KeyValuePair<string, OpenApiMediaType> content in response.Value.Content)
//                    {
//                        if (content.Value.Schema?.Reference?.Id is not null)
//                        {
//                            string schemaName = GetMeaningfulSchemaName(path, method, content.Value.Schema.Reference.Id);
//                            if (schemaName != content.Value.Schema.Reference.Id)
//                            {
//                                schemaRenames[content.Value.Schema.Reference.Id] = schemaName;
//                            }
//                        }
//                    }
//                }
//            }
//        }

//        // Process request body
//        if (operation.RequestBody?.Content is not null)
//        {
//            foreach (KeyValuePair<string, OpenApiMediaType> content in operation.RequestBody.Content)
//            {
//                if (content.Value.Schema?.Reference?.Id is not null)
//                {
//                    string schemaName = GetMeaningfulSchemaName(path, method, content.Value.Schema.Reference.Id, isRequest: true);
//                    if (schemaName != content.Value.Schema.Reference.Id)
//                    {
//                        schemaRenames[content.Value.Schema.Reference.Id] = schemaName;
//                    }
//                }
//            }
//        }
//    }

//    private static string GetMeaningfulSchemaName(string path, string method, string currentName, bool isRequest = false)
//    {
//        // Skip if already has a meaningful name (not Response, Request, Response2, etc.)
//        if (!currentName.StartsWith("Response") && !currentName.StartsWith("Request"))
//        {
//            return currentName;
//        }

//        string prefix = isRequest ? "Request" : "Response";

//        // Extract feature name from path
//        string featureName = GetFeatureNameFromPath(path);

//        // Build meaningful name
//        string newName = $"{prefix}{featureName}";

//        // Handle generic numbered responses (Response2, Response3, etc.)
//        if (currentName.StartsWith(prefix) && char.IsDigit(currentName[prefix.Length]))
//        {
//            return newName;
//        }

//        // If it's just "Response" or "Request", use the feature name
//        if (currentName == prefix || currentName == $"{prefix}2" || currentName == $"{prefix}3")
//        {
//            return newName;
//        }

//        return currentName;
//    }

//    private static string GetFeatureNameFromPath(string path)
//    {
//        // Remove leading slash and split
//        string[] parts = path.TrimStart('/').Split('/');

//        if (parts.Length == 0)
//        {
//            return "Unknown";
//        }

//        // Handle admin endpoints
//        if (parts[0] == "admin")
//        {
//            if (parts.Length > 1)
//            {
//                return GetFeatureName(parts[1], parts.Length > 2 ? parts[2] : null);
//            }
//        }

//        // Handle regular endpoints
//        return GetFeatureName(parts[0], parts.Length > 1 ? parts[1] : null);
//    }

//    private static string GetFeatureName(string resource, string? subResource)
//    {
//        // Capitalize first letter
//        string resourceName = char.ToUpperInvariant(resource[0]) + resource.Substring(1);

//        // Handle specific mappings
//        return resource switch
//        {
//            "users" => subResource switch
//            {
//                "me" => "UserInfo",
//                "availability" => "UserAvailability",
//                _ => "UserById"
//            },
//            "items" => subResource switch
//            {
//                "review-board" => "ReviewBoardItems",
//                _ => "Item"
//            },
//            "collections" => "Collection",
//            "ratings" => "Rating",
//            "categories" => "Category",
//            "comments" => "Comment",
//            "requests" => "Request",
//            _ => resourceName
//        };
//    }

//    private static void UpdateSchemaReferences(OpenApiDocument document, Dictionary<string, string> schemaRenames)
//    {
//        if (document.Components?.Schemas is null)
//        {
//            return;
//        }

//        // Update references in all schemas
//        foreach (OpenApiSchema schema in document.Components.Schemas.Values)
//        {
//            UpdateSchemaReferencesRecursive(schema, schemaRenames);
//        }

//        // Update references in paths
//        if (document.Paths is not null)
//        {
//            foreach (OpenApiPathItem pathItem in document.Paths.Values)
//            {
//                UpdatePathItemReferences(pathItem, schemaRenames);
//            }
//        }
//    }

//    private static void UpdateSchemaReferencesRecursive(OpenApiSchema schema, Dictionary<string, string> schemaRenames)
//    {
//        if (schema.Reference?.Id is not null && schemaRenames.ContainsKey(schema.Reference.Id))
//        {
//            schema.Reference.Id = schemaRenames[schema.Reference.Id];
//        }

//        if (schema.Items?.Reference?.Id is not null && schemaRenames.ContainsKey(schema.Items.Reference.Id))
//        {
//            schema.Items.Reference.Id = schemaRenames[schema.Items.Reference.Id];
//        }

//        if (schema.Properties is not null)
//        {
//            foreach (OpenApiSchema propertySchema in schema.Properties.Values)
//            {
//                UpdateSchemaReferencesRecursive(propertySchema, schemaRenames);
//            }
//        }

//        if (schema.AllOf is not null)
//        {
//            foreach (OpenApiSchema allOfSchema in schema.AllOf)
//            {
//                UpdateSchemaReferencesRecursive(allOfSchema, schemaRenames);
//            }
//        }

//        if (schema.AnyOf is not null)
//        {
//            foreach (OpenApiSchema anyOfSchema in schema.AnyOf)
//            {
//                UpdateSchemaReferencesRecursive(anyOfSchema, schemaRenames);
//            }
//        }

//        if (schema.OneOf is not null)
//        {
//            foreach (OpenApiSchema oneOfSchema in schema.OneOf)
//            {
//                UpdateSchemaReferencesRecursive(oneOfSchema, schemaRenames);
//            }
//        }
//    }

//    private static void UpdatePathItemReferences(OpenApiPathItem pathItem, Dictionary<string, string> schemaRenames)
//    {
//        if (pathItem.Operations is not null)
//        {
//            foreach (OpenApiOperation operation in pathItem.Operations.Values)
//            {
//                UpdateOperationReferences(operation, schemaRenames);
//            }
//        }
//    }

//    private static void UpdateOperationReferences(OpenApiOperation? operation, Dictionary<string, string> schemaRenames)
//    {
//        if (operation is null)
//        {
//            return;
//        }

//        if (operation.Responses is not null)
//        {
//            foreach (OpenApiResponse response in operation.Responses.Values)
//            {
//                if (response.Content is not null)
//                {
//                    foreach (OpenApiMediaType mediaType in response.Content.Values)
//                    {
//                        if (mediaType.Schema is not null)
//                        {
//                            UpdateSchemaReferencesRecursive(mediaType.Schema, schemaRenames);
//                        }
//                    }
//                }
//            }
//        }

//        if (operation.RequestBody?.Content is not null)
//        {
//            foreach (OpenApiMediaType mediaType in operation.RequestBody.Content.Values)
//            {
//                if (mediaType.Schema is not null)
//                {
//                    UpdateSchemaReferencesRecursive(mediaType.Schema, schemaRenames);
//                }
//            }
//        }
//    }
//}
