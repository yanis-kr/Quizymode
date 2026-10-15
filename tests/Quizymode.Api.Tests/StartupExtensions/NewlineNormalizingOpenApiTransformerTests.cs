using FluentAssertions;
using Microsoft.OpenApi;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

public sealed class NewlineNormalizingOpenApiTransformerTests
{
    private const string CrLfText = "First line\r\nSecond line";
    private const string CrText = "First line\rSecond line";
    private const string LfText = "First line\nSecond line";

    [Theory]
    [InlineData(CrLfText)]
    [InlineData(CrText)]
    [InlineData(LfText)]
    public void Normalize_AnyLineEnding_ReturnsLf(string input)
    {
        NewlineNormalizingOpenApiTransformer.Normalize(input).Should().Be(LfText);
    }

    [Fact]
    public void Normalize_Null_ReturnsNull()
    {
        NewlineNormalizingOpenApiTransformer.Normalize(null).Should().BeNull();
    }

    [Fact]
    public void NormalizeDocument_CrLfEverywhere_NormalizesEverySummaryAndDescription()
    {
        // Arrange
        OpenApiDocument document = new()
        {
            Info = new OpenApiInfo { Title = "t", Version = "v1", Description = CrLfText },
            Tags = new HashSet<OpenApiTag> { new() { Name = "Tag", Description = CrLfText } },
            Components = new OpenApiComponents
            {
                Schemas = new Dictionary<string, IOpenApiSchema>(),
                SecuritySchemes = new Dictionary<string, IOpenApiSecurityScheme>
                {
                    ["Bearer"] = new OpenApiSecurityScheme { Description = CrLfText }
                }
            }
        };

        OpenApiSchema componentSchema = new()
        {
            Description = CrLfText,
            Properties = new Dictionary<string, IOpenApiSchema>
            {
                ["nested"] = new OpenApiSchema
                {
                    Description = CrText,
                    Items = new OpenApiSchema { Description = CrLfText }
                },
                ["nullableRef"] = new OpenApiSchema
                {
                    AnyOf = new List<IOpenApiSchema>
                    {
                        new OpenApiSchema { Type = JsonSchemaType.Null },
                        new OpenApiSchemaReference("Target", document) { Description = CrLfText }
                    }
                }
            }
        };
        OpenApiSchema targetSchema = new() { Description = CrLfText };
        document.Components.Schemas["Component"] = componentSchema;
        document.Components.Schemas["Target"] = targetSchema;

        OpenApiParameter parameter = new()
        {
            Name = "id",
            In = ParameterLocation.Query,
            Description = CrLfText,
            Schema = new OpenApiSchema { Description = CrLfText }
        };
        OpenApiRequestBody requestBody = new()
        {
            Description = CrLfText,
            Content = new Dictionary<string, OpenApiMediaType>
            {
                ["application/json"] = new() { Schema = new OpenApiSchema { Description = CrLfText } }
            }
        };
        OpenApiResponse response = new()
        {
            Description = CrLfText,
            Content = new Dictionary<string, OpenApiMediaType>
            {
                ["application/json"] = new() { Schema = new OpenApiSchema { Description = CrLfText } }
            }
        };
        OpenApiOperation operation = new()
        {
            Summary = CrLfText,
            Description = CrLfText,
            Parameters = new List<IOpenApiParameter> { parameter },
            RequestBody = requestBody,
            Responses = new OpenApiResponses { ["200"] = response }
        };
        document.Paths = new OpenApiPaths
        {
            ["/items"] = new OpenApiPathItem
            {
                Summary = CrLfText,
                Description = CrLfText,
                Operations = new Dictionary<HttpMethod, OpenApiOperation> { [HttpMethod.Post] = operation }
            }
        };

        // Act
        NewlineNormalizingOpenApiTransformer.NormalizeDocument(document);

        // Assert
        document.Info.Description.Should().Be(LfText);
        document.Tags.Single().Description.Should().Be(LfText);
        document.Components.SecuritySchemes["Bearer"].Description.Should().Be(LfText);
        componentSchema.Description.Should().Be(LfText);
        componentSchema.Properties["nested"].Description.Should().Be(LfText);
        componentSchema.Properties["nested"].Items!.Description.Should().Be(LfText);
        ((OpenApiSchemaReference)componentSchema.Properties["nullableRef"].AnyOf![1]).Reference.Description
            .Should().Be(LfText);
        targetSchema.Description.Should().Be(LfText);
        OpenApiPathItem pathItem = (OpenApiPathItem)document.Paths["/items"];
        pathItem.Summary.Should().Be(LfText);
        pathItem.Description.Should().Be(LfText);
        operation.Summary.Should().Be(LfText);
        operation.Description.Should().Be(LfText);
        parameter.Description.Should().Be(LfText);
        parameter.Schema!.Description.Should().Be(LfText);
        requestBody.Description.Should().Be(LfText);
        requestBody.Content!["application/json"].Schema!.Description.Should().Be(LfText);
        response.Description.Should().Be(LfText);
        response.Content!["application/json"].Schema!.Description.Should().Be(LfText);
    }

    [Fact]
    public void NormalizeDocument_ReferenceWithoutOwnDescription_DoesNotGainOne()
    {
        // Arrange: reading Description through a $ref falls back to the target's text.
        OpenApiDocument document = new()
        {
            Info = new OpenApiInfo { Title = "t", Version = "v1" },
            Components = new OpenApiComponents { Schemas = new Dictionary<string, IOpenApiSchema>() }
        };
        document.Components.Schemas["Target"] = new OpenApiSchema { Description = CrLfText };
        OpenApiSchemaReference reference = new("Target", document);
        document.Components.Schemas["Holder"] = new OpenApiSchema
        {
            Properties = new Dictionary<string, IOpenApiSchema> { ["target"] = reference }
        };

        // Act
        NewlineNormalizingOpenApiTransformer.NormalizeDocument(document);

        // Assert
        reference.Reference.Description.Should().BeNull();
        document.Components.Schemas["Target"].Description.Should().Be(LfText);
    }

    [Fact]
    public void CommittedArtifact_ContainsNoEscapedCarriageReturns()
    {
        // The artifact must be identical whichever line endings the source checkout used.
        string artifactPath = Path.Combine(FindRepositoryRoot(), "docs", "openapi", "quizymode-api.json");

        string artifact = File.ReadAllText(artifactPath);

        artifact.Should().NotContain("\\r", "descriptions must use LF so Windows and Linux builds emit the same artifact");
    }

    private static string FindRepositoryRoot()
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Directory.Build.props")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName
            ?? throw new InvalidOperationException("Could not locate the repository root from the test output directory.");
    }
}
