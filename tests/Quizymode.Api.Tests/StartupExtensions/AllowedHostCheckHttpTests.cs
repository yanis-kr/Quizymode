using System.Net;
using System.Net.Sockets;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

// #933: outside Development only the listed hosts reach the startup gate and the endpoints; /health is exempt.
// The Production tests boot the real ConfigureServices and ConfigurePipeline on Kestrel with the real appsettings.json
// and appsettings.Production.json (built-in host filtering active). Hosted services are removed, so the startup gate
// stays closed: a request that passes the host check gets the gate's 503, one that fails it gets 400.
public sealed class AllowedHostCheckHttpTests
{
    private const string UnlistedHost = "evil.example";
    private const string ProbeHost = "172.26.0.5:8080";

    [Fact]
    public async Task Production_RealPipeline_UnlistedHost_Is400WithNosniff_BeforeTheStartupGate()
    {
        await using RealApiHost host = await RealApiHost.StartAsync();

        using HttpResponseMessage response = await host.Client.SendAsync(Get("/categories", UnlistedHost));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
        response.Headers.Contains("Retry-After").Should().BeFalse("the startup gate never ran");
        (await response.Content.ReadAsStringAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Production_RealPipeline_MissingHost_Is400WithNosniff()
    {
        await using RealApiHost host = await RealApiHost.StartAsync();

        // HTTP/1.0 may omit Host, so Kestrel passes the request on with an empty host.
        string response = await host.SendRawAsync("GET /categories HTTP/1.0\r\n\r\n");

        response.Should().StartWith("HTTP/1.1 400");
        response.Should().Contain("X-Content-Type-Options: nosniff");
    }

    [Theory]
    [InlineData("/alive")]
    [InlineData("/health/")]
    [InlineData("/healthz")]
    [InlineData("/health/ready")]
    public async Task Production_RealPipeline_OnlyTheExactHealthPathIsExempt(string path)
    {
        await using RealApiHost host = await RealApiHost.StartAsync();

        using HttpResponseMessage response = await host.Client.SendAsync(Get(path, ProbeHost));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("")]
    [InlineData(":443")]
    [InlineData(":8080")]
    public async Task Production_RealPipeline_ListedHost_InAnyCase_WithOrWithoutPort_ReachesTheStartupGate(string port)
    {
        await using RealApiHost host = await RealApiHost.StartAsync();

        using HttpResponseMessage response = await host.Client.SendAsync(Get("/categories", WebApiHost().ToUpperInvariant() + port));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable, "the closed startup gate answers once the host check passes");
        response.Headers.Contains("Retry-After").Should().BeTrue();
        response.Headers.GetValues("X-Content-Type-Options").Should().Equal("nosniff");
    }

    [Theory]
    [InlineData("/health", ProbeHost)]
    [InlineData("/health", UnlistedHost)]
    [InlineData("/HEALTH", ProbeHost)]
    public async Task Production_RealPipeline_HealthAnswersForAnyHost_AsForTheListedHost(string path, string requestHost)
    {
        await using RealApiHost host = await RealApiHost.StartAsync();

        using HttpResponseMessage listed = await host.Client.SendAsync(Get("/health", WebApiHost()));
        using HttpResponseMessage response = await host.Client.SendAsync(Get(path, requestHost));

        response.StatusCode.Should().NotBe(HttpStatusCode.BadRequest);
        response.StatusCode.Should().Be(listed.StatusCode);
        (await response.Content.ReadAsStringAsync()).Should().Be(await listed.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Production_RealConfiguration_RootAllowedHostsIsStillAny()
    {
        await using RealApiHost host = await RealApiHost.StartAsync();

        host.Configuration["AllowedHosts"].Should().Be("*");
        foreach (string file in Directory.GetFiles(ApiProjectPath(), "appsettings*.json"))
        {
            IConfigurationRoot settings = new ConfigurationBuilder().AddJsonFile(file, optional: false).Build();
            settings["AllowedHosts"].Should().BeOneOf([null, "*"], file);
        }
    }

    [Fact]
    public void ProductionConfiguration_ListsExactlyTheHostOfTheWebAppsApiUrl()
    {
        IConfigurationRoot configuration = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(ApiProjectPath(), "appsettings.json"), optional: false)
            .AddJsonFile(Path.Combine(ApiProjectPath(), "appsettings.Production.json"), optional: false)
            .Build();

        AllowedHostCheck.ReadAllowedHosts(configuration).Should().BeEquivalentTo([WebApiHost()]);
    }

    [Theory]
    [InlineData("container-service-1.g3tzw2psg9dm4.us-east-1.cs.amazonlightsail.com", true)]
    [InlineData("Container-Service-1.G3TZW2PSG9DM4.us-east-1.cs.amazonlightsail.com:443", true)]
    [InlineData("container-service-1.g3tzw2psg9dm4.us-east-1.cs.amazonlightsail.com.evil.example", false)]
    [InlineData("evil.example", false)]
    [InlineData("", false)]
    public void IsAllowed_ComparesTheHostWithoutPort_CaseInsensitively(string requestHost, bool allowed)
    {
        HashSet<string> hosts = AllowedHostCheck.ReadAllowedHosts(Settings(("HostFiltering:AllowedHosts:0", "CONTAINER-service-1.g3tzw2psg9dm4.us-east-1.cs.amazonlightsail.com:8443")));
        DefaultHttpContext context = new();
        context.Request.Path = "/categories";
        context.Request.Host = new HostString(requestHost);

        AllowedHostCheck.IsAllowed(context.Request, hosts).Should().Be(allowed);
    }

    [Fact]
    public async Task Development_AcceptsAnyHost_EvenWithAList()
    {
        await using LightHost host = await LightHost.StartAsync(Environments.Development, [("HostFiltering:AllowedHosts:0", "api.quizymode.test")]);

        using HttpResponseMessage response = await host.Client.SendAsync(Get("/echo", UnlistedHost));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task OutsideProduction_WithNoList_TheCheckIsOff()
    {
        await using LightHost host = await LightHost.StartAsync("Staging", []);

        using HttpResponseMessage response = await host.Client.SendAsync(Get("/echo", UnlistedHost));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Production_WithNoList_FailsStartup()
    {
        Func<Task> start = async () => await (await LightHost.StartAsync(Environments.Production, [])).DisposeAsync();

        await start.Should().ThrowAsync<InvalidOperationException>().WithMessage("*HostFiltering:AllowedHosts*");
    }

    private static HttpRequestMessage Get(string path, string host)
    {
        HttpRequestMessage request = new(HttpMethod.Get, path);
        request.Headers.Host = host;
        return request;
    }

    private static IConfiguration Settings(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(static pair => new KeyValuePair<string, string?>(pair.Key, pair.Value)))
            .Build();

    /// <summary>The host of VITE_API_URL in src/Quizymode.Web/.env.production.</summary>
    private static string WebApiHost()
    {
        string line = File.ReadAllLines(Path.Combine(FindRepositoryRoot(), "src", "Quizymode.Web", ".env.production"))
            .Single(static entry => entry.StartsWith("VITE_API_URL=", StringComparison.Ordinal));
        return new Uri(line["VITE_API_URL=".Length..].Trim()).Host;
    }

    private static string ApiProjectPath() => Path.Combine(FindRepositoryRoot(), "src", "Quizymode.Api");

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

    private static string ServerAddress(WebApplication app) =>
        app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();

    /// <summary>The real API: ConfigureServices and ConfigurePipeline in Production, without hosted services.</summary>
    private sealed class RealApiHost(WebApplication app) : IAsyncDisposable
    {
        public HttpClient Client { get; } = new() { BaseAddress = new Uri(ServerAddress(app)) };

        public IConfiguration Configuration => app.Configuration;

        public static async Task<RealApiHost> StartAsync()
        {
            WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = Environments.Production,
                ContentRootPath = ApiProjectPath(),
            });
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                // Never reached: hosted services (migrations, seeding, workers) are removed below.
                ["ConnectionStrings:quizymode"] = "Host=127.0.0.1;Port=1;Database=none;Username=none;Password=none;Timeout=1",
            });

            builder.ConfigureServices();
            builder.Services.RemoveAll<IHostedService>();

            WebApplication app = builder.Build();
            app.ConfigurePipeline();
            await app.StartAsync();
            return new RealApiHost(app);
        }

        public async Task<string> SendRawAsync(string request)
        {
            Uri address = Client.BaseAddress!;
            using TcpClient tcp = new();
            await tcp.ConnectAsync(address.Host, address.Port);
            await using NetworkStream stream = tcp.GetStream();
            await stream.WriteAsync(Encoding.ASCII.GetBytes(request));
            using StreamReader reader = new(stream, Encoding.ASCII);
            return await reader.ReadToEndAsync();
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.DisposeAsync();
        }
    }

    /// <summary>The check on its own, in ConfigurePipeline's order, for the environment and empty-list rules.</summary>
    private sealed class LightHost(WebApplication app) : IAsyncDisposable
    {
        public HttpClient Client { get; } = new() { BaseAddress = new Uri(ServerAddress(app)) };

        public static async Task<LightHost> StartAsync(string environment, (string Key, string Value)[] settings)
        {
            WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = environment,
                ContentRootPath = AppContext.BaseDirectory,
            });
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            // The copied appsettings.Production.json lists the real host; these tests set the list themselves.
            builder.Configuration.Sources.Clear();
            builder.Configuration.AddInMemoryCollection(settings.Select(static pair => new KeyValuePair<string, string?>(pair.Key, pair.Value)));
            builder.AddProxyAndSecurityHeaderServices();

            WebApplication app = builder.Build();
            app.UseForwardedHeaders();
            app.UseSecurityHeaders();
            app.UseAllowedHostCheck();
            app.MapGet("/echo", () => "ok");
            await app.StartAsync();
            return new LightHost(app);
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.DisposeAsync();
        }
    }
}
