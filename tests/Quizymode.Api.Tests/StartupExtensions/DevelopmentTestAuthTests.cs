using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>
/// AC 7.8: the DevTest scheme exists only in Development with the explicit Authentication:DevTest:Enabled opt-in
/// (AC 7.8.5), and parses only well-formed headers.
/// </summary>
public sealed class DevelopmentTestAuthTests
{
    [Fact]
    public async Task ProductionEnvironment_WithoutTheFlag_DoesNotRegisterTheDevTestScheme()
    {
        IEnumerable<string> names = await RegisteredSchemesAsync(Environments.Production, enabled: null);

        names.Should().NotContain(DevelopmentTestAuthExtensions.SchemeName);
    }

    [Fact]
    public async Task ProductionEnvironment_WithTheFlag_DoesNotRegisterTheDevTestScheme()
    {
        IEnumerable<string> names = await RegisteredSchemesAsync(Environments.Production, enabled: "true");

        names.Should().NotContain(DevelopmentTestAuthExtensions.SchemeName);
    }

    [Theory]
    [InlineData("Staging")]
    [InlineData("Preview")]
    public async Task OtherNonDevelopmentEnvironment_WithTheFlag_DoesNotRegisterTheDevTestScheme(string environment)
    {
        IEnumerable<string> names = await RegisteredSchemesAsync(environment, enabled: "true");

        names.Should().NotContain(DevelopmentTestAuthExtensions.SchemeName);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    [InlineData("")]
    [InlineData("yes")]
    public async Task DevelopmentEnvironment_WithoutTheFlag_DoesNotRegisterTheDevTestScheme(string? enabled)
    {
        IEnumerable<string> names = await RegisteredSchemesAsync(Environments.Development, enabled);

        names.Should().NotContain(DevelopmentTestAuthExtensions.SchemeName);
    }

    [Fact]
    public async Task DevelopmentEnvironment_WithTheFlag_RegistersTheDevTestScheme()
    {
        IEnumerable<string> names = await RegisteredSchemesAsync(Environments.Development, enabled: "true");

        names.Should().Contain(DevelopmentTestAuthExtensions.SchemeName);
    }

    [Theory]
    [InlineData("DevTest alice admin", HttpStatusCode.OK)]
    [InlineData("DevTest alice", HttpStatusCode.Forbidden)]
    public async Task DevelopmentEnvironment_WithTheFlag_AdminKeywordPassesTheAdminPolicy_AC_4_1_4(
        string authorization,
        HttpStatusCode expected)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Development,
            ContentRootPath = AppContext.BaseDirectory,
        });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:Cognito:Authority"] = "https://cognito-idp.test.invalid/test-pool",
            ["Authentication:Cognito:ClientId"] = "quizymode-test-client",
            [DevelopmentTestAuthExtensions.EnabledConfigKey] = "true",
        });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.AddAuthenticationServices();
        builder.AddDevelopmentTestAuthentication();

        await using WebApplication app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGet("/probe/admin", () => Results.Ok("ok")).RequireAuthorization("Admin");
        await app.StartAsync();

        string address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        using HttpClient client = new() { BaseAddress = new Uri(address) };
        using HttpRequestMessage request = new(HttpMethod.Get, "/probe/admin");
        request.Headers.TryAddWithoutValidation("Authorization", authorization);
        using HttpResponseMessage response = await client.SendAsync(request);

        response.StatusCode.Should().Be(expected);
        await app.StopAsync();
    }

    private static async Task<IEnumerable<string>> RegisteredSchemesAsync(string environment, string? enabled)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = environment,
            ContentRootPath = AppContext.BaseDirectory,
        });
        // Clear the real environment so a flag set on the test machine cannot leak in.
        builder.Configuration.Sources.Clear();
        if (enabled is not null)
        {
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                [DevelopmentTestAuthExtensions.EnabledConfigKey] = enabled,
            });
        }
        builder.Services.AddAuthentication();

        builder.AddDevelopmentTestAuthentication();

        using ServiceProvider provider = builder.Services.BuildServiceProvider();
        IAuthenticationSchemeProvider schemes = provider.GetRequiredService<IAuthenticationSchemeProvider>();
        return (await schemes.GetAllSchemesAsync()).Select(scheme => scheme.Name).ToList();
    }

    [Theory]
    [InlineData("DevTest alice", "alice", false)]
    [InlineData("DevTest alice admin", "alice", true)]
    [InlineData("DevTest user_1-2", "user_1-2", false)]
    public void TryParseHeader_AcceptsWellFormedHeaders(string header, string expectedUser, bool expectedAdmin)
    {
        bool ok = DevelopmentTestAuthExtensions.TryParseHeader(header, out string userId, out bool isAdmin);

        ok.Should().BeTrue();
        userId.Should().Be(expectedUser);
        isAdmin.Should().Be(expectedAdmin);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Bearer eyJhbGciOi")]
    [InlineData("DevTest")]
    [InlineData("DevTest ")]
    [InlineData("DevTest alice owner")]
    [InlineData("DevTest alice admin extra")]
    [InlineData("DevTest ali;ce")]
    public void TryParseHeader_RejectsMalformedHeaders(string? header)
    {
        bool ok = DevelopmentTestAuthExtensions.TryParseHeader(header, out _, out bool isAdmin);

        ok.Should().BeFalse();
        isAdmin.Should().BeFalse();
    }
}
