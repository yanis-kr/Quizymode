using System.Net;
using FluentAssertions;
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

// #906: CORS restricted to the web origins outside Development, X-Forwarded-Host ignored, and the API's
// Strict-Transport-Security and X-Content-Type-Options headers. Real Kestrel host, production pipeline order.
public sealed class SecurityHardeningHttpTests
{
    private const string WebOrigin = "https://www.quizymode.com";
    private const string ApexOrigin = "https://quizymode.com";

    [Fact]
    public void ProductionConfiguration_ListsExactlyTheTwoWebOrigins()
    {
        IConfigurationRoot configuration = new ConfigurationBuilder().AddJsonFile(ProductionSettingsPath(), optional: false).Build();

        configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            .Should().Equal(WebOrigin, ApexOrigin);
    }

    [Theory]
    [InlineData(WebOrigin, true)]
    [InlineData(ApexOrigin, true)]
    [InlineData("https://evil.example", false)]
    [InlineData("http://www.quizymode.com", false)]
    [InlineData("https://www.quizymode.com.evil.example", false)]
    [InlineData("http://localhost:7000", false)]
    public async Task Production_PreflightIsAllowedOnlyFromTheWebOrigins(string origin, bool allowed)
    {
        await using TestHost host = await TestHost.StartAsync(Environments.Production, useProductionSettings: true);

        using HttpResponseMessage response = await host.Client.SendAsync(Preflight(origin));

        if (allowed)
        {
            response.Headers.GetValues("Access-Control-Allow-Origin").Should().Equal(origin);
        }
        else
        {
            response.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse();
        }
    }

    [Fact]
    public async Task OutsideDevelopment_WithNoConfiguredOrigins_NoOriginIsAllowed()
    {
        await using TestHost host = await TestHost.StartAsync("Staging", useProductionSettings: false);

        using HttpResponseMessage response = await host.Client.SendAsync(Preflight(WebOrigin));

        response.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse();
    }

    [Fact]
    public async Task Development_PreflightFromTheViteDevServerIsAllowed()
    {
        await using TestHost host = await TestHost.StartAsync(Environments.Development, useProductionSettings: false);

        using HttpResponseMessage response = await host.Client.SendAsync(Preflight("http://localhost:7000"));

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        response.Headers.GetValues("Access-Control-Allow-Origin").Should().Equal("*");
    }

    [Fact]
    public async Task TrustedProxy_ForwardedHostIsIgnored_ForwardedForAndProtoAreHonored()
    {
        await using TestHost host = await TestHost.StartAsync(Environments.Production, useProductionSettings: true);
        using HttpRequestMessage request = new(HttpMethod.Get, "echo");
        request.Headers.Add("X-Forwarded-Host", "evil.example");
        request.Headers.Add("X-Forwarded-For", "203.0.113.7");
        request.Headers.Add("X-Forwarded-Proto", "https");

        using HttpResponseMessage response = await host.Client.SendAsync(request);
        string body = await response.Content.ReadAsStringAsync();

        body.Should().Be($"{host.Client.BaseAddress!.Authority}|https|203.0.113.7");
    }

    [Fact]
    public async Task OutsideDevelopment_HttpsResponse_HasOneYearHsts()
    {
        await using TestHost host = await TestHost.StartAsync(Environments.Production, useProductionSettings: true);

        using HttpResponseMessage response = await host.Client.SendAsync(Forwarded("echo", "https"));

        string hsts = response.Headers.GetValues("Strict-Transport-Security").Single();
        hsts.Should().StartWith("max-age=");
        int maxAge = int.Parse(hsts["max-age=".Length..].Split(';')[0]);
        maxAge.Should().BeGreaterThanOrEqualTo(31536000);
        hsts.Should().NotContainEquivalentOf("includeSubDomains");
    }

    [Fact]
    public async Task PlainHttp_OrDevelopment_HasNoHsts()
    {
        await using (TestHost production = await TestHost.StartAsync(Environments.Production, useProductionSettings: true))
        {
            using HttpResponseMessage plain = await production.Client.SendAsync(Forwarded("echo", "http"));
            plain.Headers.Contains("Strict-Transport-Security").Should().BeFalse("the load balancer's internal probe is plain HTTP");
        }

        await using TestHost development = await TestHost.StartAsync(Environments.Development, useProductionSettings: false);
        using HttpResponseMessage https = await development.Client.SendAsync(Forwarded("echo", "https"));
        https.Headers.Contains("Strict-Transport-Security").Should().BeFalse();
    }

    [Theory]
    [InlineData("Production", "echo")]
    [InlineData("Production", "sets-nosniff")]
    [InlineData("Production", "appends-nosniff")]
    [InlineData("Production", "no-such-route")]
    [InlineData("Development", "echo")]
    public async Task EveryResponse_HasExactlyOneNosniff(string environment, string path)
    {
        await using TestHost host = await TestHost.StartAsync(environment, useProductionSettings: environment == Environments.Production);

        using HttpResponseMessage response = await host.Client.SendAsync(Forwarded(path, "https"));

        response.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
    }

    [Fact]
    public void ProductionSettingsAndLightsailDoc_RecordWhyForwardedHeadersAreTrustedFromAnyNetwork()
    {
        string[] settingsComments = File.ReadAllLines(ProductionSettingsPath())
            .Select(line => line.Trim())
            .Where(line => line.StartsWith("//", StringComparison.Ordinal))
            .ToArray();
        string comment = string.Join(" ", settingsComments.Select(line => line.TrimStart('/').Trim()));
        comment.Should().Contain("trusted from any network only because").And.Contain("load balancer is the sole path in");

        string doc = File.ReadAllText(Path.Combine(FindRepositoryRoot(), "docs", "infra", "LIGHTSAIL.md"));
        doc.Should().Contain("Forwarded headers are trusted from any network only because the Lightsail load balancer is the sole path in");
    }

    private static HttpRequestMessage Preflight(string origin)
    {
        HttpRequestMessage request = new(HttpMethod.Options, "echo");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "GET");
        return request;
    }

    // A request as the load balancer forwards it: a public Host and the original scheme in X-Forwarded-Proto.
    private static HttpRequestMessage Forwarded(string path, string proto)
    {
        HttpRequestMessage request = new(HttpMethod.Get, path);
        request.Headers.Host = "api.quizymode.test";
        request.Headers.Add("X-Forwarded-Proto", proto);
        return request;
    }

    private static string ProductionSettingsPath() =>
        Path.Combine(FindRepositoryRoot(), "src", "Quizymode.Api", "appsettings.Production.json");

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

    private sealed class TestHost(WebApplication app, HttpClient client) : IAsyncDisposable
    {
        public HttpClient Client { get; } = client;

        public static async Task<TestHost> StartAsync(string environment, bool useProductionSettings)
        {
            WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = environment,
                ContentRootPath = AppContext.BaseDirectory,
            });
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            if (useProductionSettings)
            {
                builder.Configuration.AddJsonFile(ProductionSettingsPath(), optional: false);
            }

            builder.AddProxyAndSecurityHeaderServices();
            builder.AddCorsServices();

            WebApplication app = builder.Build();
            // The production order (ConfigurePipeline): forwarded headers, security headers, then CORS.
            app.UseForwardedHeaders();
            app.UseSecurityHeaders();
            app.UseCors(Quizymode.Api.StartupExtensions.StartupExtensions.CorsPolicyName);
            app.MapGet("/echo", (HttpContext context) =>
                $"{context.Request.Host}|{context.Request.Scheme}|{context.Connection.RemoteIpAddress}");
            app.MapGet("/sets-nosniff", (HttpContext context) =>
            {
                context.Response.Headers.XContentTypeOptions = "nosniff";
                return "ok";
            });
            app.MapGet("/appends-nosniff", (HttpContext context) =>
            {
                context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
                return "ok";
            });
            await app.StartAsync();

            string address = app.Services.GetRequiredService<IServer>()
                .Features.Get<IServerAddressesFeature>()!.Addresses.First();
            return new TestHost(app, new HttpClient { BaseAddress = new Uri(address) });
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.DisposeAsync();
        }
    }
}
