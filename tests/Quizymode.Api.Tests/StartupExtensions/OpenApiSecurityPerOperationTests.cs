using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

public sealed class OpenApiSecurityPerOperationTests
{
    [Fact]
    public async Task Document_PublicRoute_AllowsAnonymousAndOptionalBearer()
    {
        OpenApiDocument document = await BuildDocumentAsync();

        IList<OpenApiSecurityRequirement> security = OperationOf(document, "/public", HttpMethod.Get).Security!;

        security.Should().HaveCount(2);
        security.Should().ContainSingle(requirement => requirement.Count == 0, "anonymous access is one accepted alternative");
        security.Should().ContainSingle(requirement => HasBearer(requirement), "a Bearer token is the other alternative");
    }

    [Fact]
    public async Task Document_RouteWithoutAuthorizationMetadata_IsDescribedLikeAnAnonymousRoute()
    {
        OpenApiDocument document = await BuildDocumentAsync();

        IList<OpenApiSecurityRequirement> security = OperationOf(document, "/unmarked", HttpMethod.Get).Security!;

        security.Should().ContainSingle(requirement => requirement.Count == 0);
        security.Should().ContainSingle(requirement => HasBearer(requirement));
    }

    [Fact]
    public async Task Document_ProtectedRoute_RequiresBearerOnly()
    {
        OpenApiDocument document = await BuildDocumentAsync();

        IList<OpenApiSecurityRequirement> security = OperationOf(document, "/protected", HttpMethod.Get).Security!;

        security.Should().ContainSingle();
        HasBearer(security[0]).Should().BeTrue();
    }

    [Fact]
    public async Task Document_AdminPolicyRoute_RequiresBearerOnly()
    {
        OpenApiDocument document = await BuildDocumentAsync();

        IList<OpenApiSecurityRequirement> security = OperationOf(document, "/admin/thing", HttpMethod.Get).Security!;

        security.Should().ContainSingle();
        HasBearer(security[0]).Should().BeTrue();
    }

    [Fact]
    public async Task Document_RouteInAuthorizedGroupThatAllowsAnonymous_AllowsAnonymous()
    {
        OpenApiDocument document = await BuildDocumentAsync();

        IList<OpenApiSecurityRequirement> security = OperationOf(document, "/group/open", HttpMethod.Get).Security!;

        security.Should().ContainSingle(requirement => requirement.Count == 0);
    }

    [Fact]
    public async Task Document_HasNoGlobalSecurityRequirement_SoNoOperationInheritsBearer()
    {
        OpenApiDocument document = await BuildDocumentAsync();

        (document.Security ?? new List<OpenApiSecurityRequirement>()).Should().BeEmpty();
        document.Components!.SecuritySchemes.Should().ContainKey("Bearer");
        document.Paths.Values
            .SelectMany(path => path.Operations!.Values)
            .Should().OnlyContain(operation => operation.Security != null && operation.Security.Count > 0);
    }

    private static bool HasBearer(OpenApiSecurityRequirement requirement)
    {
        return requirement.Keys.Any(scheme => scheme.Reference?.Id == "Bearer");
    }

    private static OpenApiOperation OperationOf(OpenApiDocument document, string path, HttpMethod method)
    {
        return document.Paths[path].Operations![method];
    }

    // Builds the real OpenAPI services (the production transformers) over a few representative endpoints. The host starts on a
    // loopback port chosen by the OS because route endpoints only reach the API explorer once the host has started; no request is sent.
    private static async Task<OpenApiDocument> BuildDocumentAsync()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        builder.AddOpenApiServices();
        builder.Services.AddAuthorization(options => options.AddPolicy("Admin", policy => policy.RequireAuthenticatedUser()));
        await using WebApplication app = builder.Build();

        app.MapGet("public", () => Results.Ok()).AllowAnonymous();
        app.MapGet("unmarked", () => Results.Ok());
        app.MapGet("protected", () => Results.Ok()).RequireAuthorization();
        app.MapGet("admin/thing", () => Results.Ok()).RequireAuthorization("Admin");
        RouteGroupBuilder group = app.MapGroup("group").RequireAuthorization();
        group.MapGet("open", () => Results.Ok()).AllowAnonymous();

        await app.StartAsync();
        try
        {
            IOpenApiDocumentProvider provider = app.Services.GetRequiredKeyedService<IOpenApiDocumentProvider>("v1");
            return await provider.GetOpenApiDocumentAsync(CancellationToken.None);
        }
        finally
        {
            await app.StopAsync();
        }
    }
}
