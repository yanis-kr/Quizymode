using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Quizymode.Api.StartupExtensions;

/// <summary>
/// Normalizes CRLF and lone CR to LF in every summary and description of the document.
/// Multi-line XML doc comments carry the line endings of the checked-out source file, so a
/// Windows checkout (core.autocrlf=true) and a Linux checkout would otherwise emit different
/// OpenAPI artifacts for the same code. Registered last so it sees text from every other transformer.
/// Example, default and enum values (JSON nodes, e.g. from XML <c>&lt;example&gt;</c> tags), links, callbacks
/// and external docs are not walked: nothing in the API emits multi-line text there today, and
/// <c>CommittedArtifact_ContainsNoEscapedCarriageReturns</c> fails if that changes.
/// </summary>
internal sealed class NewlineNormalizingOpenApiTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        NormalizeDocument(document);
        return Task.CompletedTask;
    }

    internal static void NormalizeDocument(OpenApiDocument document)
    {
        Walker walker = new();
        walker.Visit(document);
    }

    internal static string? Normalize(string? value) =>
        value is null || !value.Contains('\r')
            ? value
            : value.Replace("\r\n", "\n").Replace('\r', '\n');

    private sealed class Walker
    {
        private readonly HashSet<object> _visited = new(ReferenceEqualityComparer.Instance);

        public void Visit(OpenApiDocument document)
        {
            if (document.Info is not null)
            {
                document.Info.Summary = Normalize(document.Info.Summary);
                document.Info.Description = Normalize(document.Info.Description);
            }

            if (document.Tags is not null)
            {
                foreach (OpenApiTag tag in document.Tags)
                {
                    tag.Description = Normalize(tag.Description);
                }
            }

            if (document.Paths is not null)
            {
                foreach (IOpenApiPathItem pathItem in document.Paths.Values)
                {
                    VisitPathItem(pathItem);
                }
            }

            OpenApiComponents? components = document.Components;
            if (components is null)
            {
                return;
            }

            VisitAll(components.Schemas?.Values, VisitSchema);
            VisitAll(components.Parameters?.Values, VisitParameter);
            VisitAll(components.RequestBodies?.Values, VisitRequestBody);
            VisitAll(components.Responses?.Values, VisitResponse);
            VisitAll(components.Headers?.Values, VisitHeader);
            VisitAll(components.PathItems?.Values, VisitPathItem);
            VisitAll(components.SecuritySchemes?.Values, VisitSecurityScheme);
        }

        private static void VisitAll<T>(IEnumerable<T>? elements, Action<T> visit)
        {
            if (elements is null)
            {
                return;
            }

            foreach (T element in elements)
            {
                visit(element);
            }
        }

        // A $ref element reports its target's text when it has no override of its own, so writing
        // through it would add a sibling "description" that was never there. Only the override is
        // normalized here; the target is normalized where it is defined (components).
        private static bool TryNormalizeReference(object element)
        {
            switch (element)
            {
                case OpenApiSchemaReference schemaReference:
                    NormalizeReference(schemaReference.Reference);
                    return true;
                case OpenApiParameterReference parameterReference:
                    NormalizeReference(parameterReference.Reference);
                    return true;
                case OpenApiRequestBodyReference requestBodyReference:
                    NormalizeReference(requestBodyReference.Reference);
                    return true;
                case OpenApiResponseReference responseReference:
                    NormalizeReference(responseReference.Reference);
                    return true;
                case OpenApiHeaderReference headerReference:
                    NormalizeReference(headerReference.Reference);
                    return true;
                case OpenApiPathItemReference pathItemReference:
                    NormalizeReference(pathItemReference.Reference);
                    return true;
                case OpenApiSecuritySchemeReference securitySchemeReference:
                    NormalizeReference(securitySchemeReference.Reference);
                    return true;
                default:
                    return false;
            }
        }

        private static void NormalizeReference(BaseOpenApiReference reference)
        {
            if (reference is OpenApiReferenceWithDescriptionAndSummary withSummary)
            {
                withSummary.Summary = Normalize(withSummary.Summary);
            }

            if (reference is OpenApiReferenceWithDescription withDescription)
            {
                withDescription.Description = Normalize(withDescription.Description);
            }
        }

        private bool FirstVisit(object element) => _visited.Add(element);

        private void VisitPathItem(IOpenApiPathItem pathItem)
        {
            if (TryNormalizeReference(pathItem) || !FirstVisit(pathItem) || pathItem is not OpenApiPathItem item)
            {
                return;
            }

            item.Summary = Normalize(item.Summary);
            item.Description = Normalize(item.Description);
            VisitAll(item.Parameters, VisitParameter);
            VisitAll(item.Operations?.Values, VisitOperation);
        }

        private void VisitOperation(OpenApiOperation operation)
        {
            if (!FirstVisit(operation))
            {
                return;
            }

            operation.Summary = Normalize(operation.Summary);
            operation.Description = Normalize(operation.Description);
            VisitAll(operation.Parameters, VisitParameter);
            if (operation.RequestBody is not null)
            {
                VisitRequestBody(operation.RequestBody);
            }

            VisitAll(operation.Responses?.Values, VisitResponse);
        }

        private void VisitParameter(IOpenApiParameter parameter)
        {
            if (TryNormalizeReference(parameter) || !FirstVisit(parameter) || parameter is not OpenApiParameter concrete)
            {
                return;
            }

            concrete.Description = Normalize(concrete.Description);
            if (concrete.Schema is not null)
            {
                VisitSchema(concrete.Schema);
            }

            VisitContent(concrete.Content);
        }

        private void VisitRequestBody(IOpenApiRequestBody requestBody)
        {
            if (TryNormalizeReference(requestBody) || !FirstVisit(requestBody) || requestBody is not OpenApiRequestBody concrete)
            {
                return;
            }

            concrete.Description = Normalize(concrete.Description);
            VisitContent(concrete.Content);
        }

        private void VisitResponse(IOpenApiResponse response)
        {
            if (TryNormalizeReference(response) || !FirstVisit(response) || response is not OpenApiResponse concrete)
            {
                return;
            }

            concrete.Description = Normalize(concrete.Description);
            VisitContent(concrete.Content);
            VisitAll(concrete.Headers?.Values, VisitHeader);
        }

        private void VisitHeader(IOpenApiHeader header)
        {
            if (TryNormalizeReference(header) || !FirstVisit(header) || header is not OpenApiHeader concrete)
            {
                return;
            }

            concrete.Description = Normalize(concrete.Description);
            if (concrete.Schema is not null)
            {
                VisitSchema(concrete.Schema);
            }

            VisitContent(concrete.Content);
        }

        private void VisitSecurityScheme(IOpenApiSecurityScheme securityScheme)
        {
            if (TryNormalizeReference(securityScheme) || !FirstVisit(securityScheme) || securityScheme is not OpenApiSecurityScheme concrete)
            {
                return;
            }

            concrete.Description = Normalize(concrete.Description);
        }

        private void VisitContent(IDictionary<string, OpenApiMediaType>? content)
        {
            VisitAll(content?.Values, mediaType =>
            {
                if (mediaType.Schema is not null)
                {
                    VisitSchema(mediaType.Schema);
                }
            });
        }

        private void VisitSchema(IOpenApiSchema schema)
        {
            if (TryNormalizeReference(schema) || !FirstVisit(schema) || schema is not OpenApiSchema concrete)
            {
                return;
            }

            concrete.Title = Normalize(concrete.Title);
            concrete.Description = Normalize(concrete.Description);
            VisitAll(concrete.Properties?.Values, VisitSchema);
            VisitAll(concrete.PatternProperties?.Values, VisitSchema);
            VisitAll(concrete.Definitions?.Values, VisitSchema);
            VisitAll(concrete.AllOf, VisitSchema);
            VisitAll(concrete.AnyOf, VisitSchema);
            VisitAll(concrete.OneOf, VisitSchema);
            if (concrete.Items is not null)
            {
                VisitSchema(concrete.Items);
            }

            if (concrete.Not is not null)
            {
                VisitSchema(concrete.Not);
            }

            if (concrete.AdditionalProperties is not null)
            {
                VisitSchema(concrete.AdditionalProperties);
            }
        }
    }
}
