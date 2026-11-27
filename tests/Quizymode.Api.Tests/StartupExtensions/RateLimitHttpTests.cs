using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Features.Analytics;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Features.Items.Export;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Features.Items.UploadToCollection;
using Quizymode.Api.Features.Ratings;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.StartupExtensions;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

// AC 17.1 and 17.2 (#904): the production limiter configuration over real HTTP, with low configured limits.
public sealed class RateLimitHttpTests
{
    private const string GlobalMessage = "Too many requests. Please wait a moment and try again.";

    private static Task<JwtHttpTestHost> StartAsync(params (string Rule, int Permits)[] limits)
    {
        Dictionary<string, string?> configuration = limits.ToDictionary(
            limit => $"RateLimits:{limit.Rule}:PermitLimit",
            limit => (string?)limit.Permits.ToString());

        return JwtHttpTestHost.StartAsync(
            () => throw new InvalidOperationException("Anonymous requests need no database."),
            _ => { },
            app =>
            {
                app.MapPost("analytics/page-views", () => Results.Ok()).RequireRateLimiting("page-views");
                app.MapPost("writes/a", () => Results.Ok()).RequireRateLimiting("content-writes");
                app.MapPost("writes/b", () => Results.Ok()).RequireRateLimiting("content-writes");
                app.MapGet("items", () => Results.Ok()).RequireRateLimiting("large-item-pages");
                app.MapGet("items/export", () => Results.Ok()).RequireRateLimiting("item-export");
                app.MapGet("anything", () => Results.Ok());
                app.MapGet("health", () => Results.Ok());
                app.MapGet("alive", () => Results.Ok());
                foreach (string policy in ExistingPolicies)
                {
                    app.MapPost($"existing/{policy}", () => Results.Ok()).RequireRateLimiting(policy);
                }
            },
            useRateLimiting: true,
            extraConfiguration: configuration);
    }

    private static readonly string[] ExistingPolicies =
    [
        "analytics-events", "client-errors", "search", "taxonomy-suggest", "feedback-submissions", "study-guide-documents",
        "media-uploads", "media-reports", "media-reads", "review-queue-enqueue", "username-availability"
    ];

    private static async Task<HttpStatusCode> StatusAsync(JwtHttpTestHost host, HttpMethod method, string path)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path);
        using HttpResponseMessage response = await host.Client.SendAsync(request);
        return response.StatusCode;
    }

    private static async Task AssertRejectedAsync(JwtHttpTestHost host, HttpMethod method, string path, string message)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path);
        using HttpResponseMessage response = await host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        response.Headers.RetryAfter!.Delta!.Value.Should().BeGreaterThan(TimeSpan.Zero);
        using JsonDocument problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        problem.RootElement.GetProperty("detail").GetString().Should().Be(message);
        problem.RootElement.GetProperty("type").GetString().Should().Be("https://tools.ietf.org/html/rfc6585#section-4");
    }

    [Theory]
    [InlineData("PageViews", "POST", "analytics/page-views", "Too many page views. Please slow down.")]
    [InlineData("ContentWrites", "POST", "writes/a", "Too many changes in a short time. Please wait a few minutes and try again.")]
    [InlineData("LargeItemPages", "GET", "items?pageSize=101", "Too many large list requests. Please wait a few minutes and try again.")]
    [InlineData("ItemExport", "GET", "items/export", "Too many exports. Please wait a few minutes and try again.")]
    [InlineData("Global", "GET", "anything", GlobalMessage)]
    public async Task RequestBeyondTheLimit_Is429WithRetryAfterAndThatMessage(string rule, string method, string path, string message)
    {
        await using JwtHttpTestHost host = await StartAsync((rule, 3));

        for (int call = 0; call < 3; call++)
        {
            (await StatusAsync(host, new HttpMethod(method), path)).Should().Be(HttpStatusCode.OK);
        }

        await AssertRejectedAsync(host, new HttpMethod(method), path, message);
    }

    [Fact]
    public async Task ContentWriteBudget_IsSharedAcrossEndpoints()
    {
        await using JwtHttpTestHost host = await StartAsync(("ContentWrites", 2));

        (await StatusAsync(host, HttpMethod.Post, "writes/a")).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(host, HttpMethod.Post, "writes/b")).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(host, HttpMethod.Post, "writes/a")).Should().Be(HttpStatusCode.TooManyRequests);
        (await StatusAsync(host, HttpMethod.Post, "writes/b")).Should().Be(HttpStatusCode.TooManyRequests);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task SmallItemPages_NeverConsumeTheLargePageBudget(bool smallFirst)
    {
        await using JwtHttpTestHost host = await StartAsync(("LargeItemPages", 1));

        if (smallFirst)
        {
            for (int call = 0; call < 3; call++)
            {
                (await StatusAsync(host, HttpMethod.Get, "items?pageSize=100")).Should().Be(HttpStatusCode.OK);
            }
        }

        (await StatusAsync(host, HttpMethod.Get, "items?pageSize=101")).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(host, HttpMethod.Get, "items?pageSize=101")).Should().Be(HttpStatusCode.TooManyRequests);
        (await StatusAsync(host, HttpMethod.Get, "items?pageSize=100")).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(host, HttpMethod.Get, "items")).Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GlobalRefusalOnAPolicyEndpoint_ShowsTheGlobalMessage()
    {
        await using JwtHttpTestHost host = await StartAsync(("Global", 1));

        (await StatusAsync(host, HttpMethod.Post, "existing/search")).Should().Be(HttpStatusCode.OK);

        await AssertRejectedAsync(host, HttpMethod.Post, "existing/search", GlobalMessage);
    }

    [Fact]
    public async Task HealthAliveAndPreflight_AreNeverLimited()
    {
        await using JwtHttpTestHost host = await StartAsync(("Global", 1));
        (await StatusAsync(host, HttpMethod.Get, "anything")).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(host, HttpMethod.Get, "anything")).Should().Be(HttpStatusCode.TooManyRequests);

        for (int call = 0; call < 5; call++)
        {
            (await StatusAsync(host, HttpMethod.Get, "health")).Should().Be(HttpStatusCode.OK);
            (await StatusAsync(host, HttpMethod.Get, "alive")).Should().Be(HttpStatusCode.OK);
            using HttpRequestMessage preflight = JwtHttpTestHost.Request(HttpMethod.Options, "anything");
            preflight.Headers.Add("Origin", "https://example.test");
            preflight.Headers.Add("Access-Control-Request-Method", "GET");
            using HttpResponseMessage response = await host.Client.SendAsync(preflight);
            response.StatusCode.Should().NotBe(HttpStatusCode.TooManyRequests);
        }

        // An OPTIONS request that is not a preflight is limited like any other.
        (await StatusAsync(host, HttpMethod.Options, "anything")).Should().Be(HttpStatusCode.TooManyRequests);
    }

    [Theory]
    [InlineData("analytics-events", 120, "Too many analytics events. Please slow down.")]
    [InlineData("client-errors", 30, "Too many error reports. Please slow down.")]
    [InlineData("search", 120, "Too many searches. Please wait a moment and try again.")]
    [InlineData("taxonomy-suggest", 60, "Too many topic suggestions. Please wait a moment and try again.")]
    [InlineData("feedback-submissions", 5, "Too many feedback submissions. Please wait a few minutes and try again.")]
    [InlineData("study-guide-documents", 20, "Too many study guide uploads. Please wait a while and try again.")]
    [InlineData("media-uploads", 20, "Too many picture uploads. Please wait a while and try again.")]
    [InlineData("media-reports", 20, "Too many picture reports. Please wait a few minutes and try again.")]
    [InlineData("media-reads", 120, "Too many picture requests. Please wait a moment and try again.")]
    [InlineData("review-queue-enqueue", 300, "Too many Review queue updates. Please slow down.")]
    [InlineData("username-availability", 30, "Too many display name checks. Please wait a few minutes and try again.")]
    public async Task ExistingPolicy_KeepsItsLimitAndHasItsOwnMessage(string policy, int limit, string message)
    {
        await using JwtHttpTestHost host = await StartAsync();

        for (int call = 0; call < limit; call++)
        {
            (await StatusAsync(host, HttpMethod.Post, $"existing/{policy}")).Should().Be(HttpStatusCode.OK);
        }

        await AssertRejectedAsync(host, HttpMethod.Post, $"existing/{policy}", message);
    }

    [Fact]
    public async Task Endpoints_CarryTheirPolicy()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        IConfiguration configuration = builder.Configuration;
        builder.AddRateLimitingServices();
        IFeatureRegistration[] registrations =
        [
            new AddItem.FeatureRegistration(), new AddItemsBulk.FeatureRegistration(),
            new UploadItemsToCollection.FeatureRegistration(), new AddCollection.FeatureRegistration(),
            new AddComment.FeatureRegistration(), new GetComments.FeatureRegistration(),
            new AddOrUpdateRating.FeatureRegistration(), new AddOrUpdateCollectionRating.FeatureRegistration()
        ];
        foreach (IFeatureRegistration registration in registrations)
        {
            registration.AddToServiceCollection(builder.Services, configuration);
        }

        // Only needed so the handler parameters are recognised as services; nothing is resolved.
        builder.Services.AddScoped<ApplicationDbContext>(_ => throw new InvalidOperationException());
        builder.Services.AddSingleton(Mock.Of<ISimHashService>());
        builder.Services.AddSingleton(Mock.Of<IUserContext>());
        builder.Services.AddSingleton(Mock.Of<IAuditService>());
        builder.Services.AddSingleton(Mock.Of<ITaxonomyItemCategoryResolver>());
        builder.Services.AddSingleton(Mock.Of<ITaxonomyRegistry>());
        builder.Services.AddSingleton(Mock.Of<ITextModerationService>());
        builder.Services.AddSingleton(Mock.Of<IIpGeolocationService>());
        builder.Services.AddSingleton(Mock.Of<IAttributionClassifier>());
        builder.Services.AddSingleton(Mock.Of<IMemoryCache>());
        await using WebApplication app = builder.Build();

        IEndpoint[] endpoints =
        [
            new TrackPageView.Endpoint(), new AddItem.Endpoint(), new AddItemsBulk.Endpoint(),
            new UploadItemsToCollection.Endpoint(), new AddCollection.Endpoint(), new AddComment.Endpoint(),
            new AddOrUpdateRating.Endpoint(), new AddOrUpdateCollectionRating.Endpoint(), new GetItems.Endpoint(),
            new ExportItems.Endpoint(), new GetComments.Endpoint()
        ];
        foreach (IEndpoint endpoint in endpoints)
        {
            endpoint.MapEndpoint(app);
        }

        Dictionary<string, string?> policies = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .Cast<RouteEndpoint>()
            .ToDictionary(
                endpoint => $"{endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods[0]} {endpoint.RoutePattern.RawText!.TrimStart('/')}",
                endpoint => endpoint.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName);

        policies.Should().BeEquivalentTo(new Dictionary<string, string?>
        {
            ["POST analytics/page-views"] = "page-views",
            ["POST items"] = "content-writes",
            ["POST items/bulk"] = "content-writes",
            ["POST items/upload-to-collection"] = "content-writes",
            ["POST collections"] = "content-writes",
            ["POST comments"] = "content-writes",
            ["POST ratings/{itemId}"] = "content-writes",
            ["POST collections/{id:guid}/rating"] = "content-writes",
            ["GET items"] = "large-item-pages",
            ["GET items/export"] = "item-export",
            ["GET comments"] = null
        });
    }

    [Fact]
    public void Defaults_MatchTheAgreedTable()
    {
        using WebApplication app = BuildWithConfiguration([]);

        RateLimitSettings limits = app.Services.GetRequiredService<IOptions<RateLimitSettings>>().Value;
        QuotaSettings quotas = app.Services.GetRequiredService<IOptions<QuotaSettings>>().Value;

        new[] { limits.Global, limits.PageViews, limits.ContentWrites, limits.LargeItemPages, limits.ItemExport }
            .Select(rule => (rule.PermitLimit, rule.WindowSeconds))
            .Should().Equal((2400, 60), (300, 600), (120, 600), (60, 600), (10, 600));
        (quotas.ItemsPerDay, quotas.CollectionsPerDay, quotas.CommentsPerDay).Should().Be((500, 50, 100));
    }

    [Fact]
    public void ConfiguredValues_OverrideTheDefaults_AndKeepTheRest()
    {
        using WebApplication app = BuildWithConfiguration(new Dictionary<string, string?>
        {
            ["RateLimits:Global:PermitLimit"] = "7",
            ["Quotas:CommentsPerDay"] = "9"
        });

        RateLimitSettings limits = app.Services.GetRequiredService<IOptions<RateLimitSettings>>().Value;
        QuotaSettings quotas = app.Services.GetRequiredService<IOptions<QuotaSettings>>().Value;

        (limits.Global.PermitLimit, limits.Global.WindowSeconds).Should().Be((7, 60));
        (quotas.CommentsPerDay, quotas.ItemsPerDay).Should().Be((9, 500));
    }

    [Theory]
    [InlineData("RateLimits:ContentWrites:PermitLimit")]
    [InlineData("RateLimits:Global:WindowSeconds")]
    [InlineData("Quotas:ItemsPerDay")]
    public async Task NonPositiveValue_FailsAtStartup(string key)
    {
        await using WebApplication app = BuildWithConfiguration(new Dictionary<string, string?> { [key] = "0" });

        Func<Task> start = () => app.StartAsync();

        await start.Should().ThrowAsync<OptionsValidationException>();
    }

    private static WebApplication BuildWithConfiguration(Dictionary<string, string?> values)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Configuration.AddInMemoryCollection(values);
        builder.AddRateLimitingServices();
        return builder.Build();
    }
}
