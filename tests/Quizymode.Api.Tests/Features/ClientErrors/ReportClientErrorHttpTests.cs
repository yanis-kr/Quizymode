using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.ClientErrors;
using Quizymode.Api.Services;
using Quizymode.Api.StartupExtensions;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.ClientErrors;

/// <summary>
/// OBS-001 over real HTTP with the production rate-limiter policy: body parsing (JSON and the
/// text/plain bodies sendBeacon sends), 400/413/429 responses, and that none of them store a row.
/// </summary>
public sealed class ReportClientErrorHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private WebApplication _app = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        Mock<IUserContext> userContext = new();
        userContext.SetupGet(context => context.IsAuthenticated).Returns(false);

        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.AddRateLimitingServices();
        builder.Services.AddScoped<ApplicationDbContext>(_ => CreateDbContext());
        builder.Services.AddScoped<IValidator<ReportClientError.Request>, ReportClientError.Validator>();
        builder.Services.AddSingleton(userContext.Object);
        _app = builder.Build();
        _app.UseRateLimiter();
        new ReportClientError.Endpoint().MapEndpoint(_app);
        await _app.StartAsync();

        string address = _app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        _client = new HttpClient { BaseAddress = new Uri(address) };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36");
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    private static object Body(string sessionId, string message = "boom") => new
    {
        source = "window",
        message,
        name = "Error",
        stack = "Error: boom\n    at run (http://localhost:7000/src/a.ts?t=1:1:1)",
        path = "/quiz?secret=1",
        appVersion = "3.58.0",
        sessionId
    };

    private async Task<int> RowCountAsync()
    {
        await using ApplicationDbContext db = CreateDbContext();
        return await db.ClientErrors.CountAsync();
    }

    [Fact]
    public async Task Post_AcceptsJsonAndTextPlainBodies()
    {
        using HttpResponseMessage json = await _client.PostAsJsonAsync("/client-errors", Body("s-json"));
        using HttpResponseMessage beacon = await _client.PostAsync(
            "/client-errors",
            new StringContent(JsonSerializer.Serialize(Body("s-beacon")), Encoding.UTF8, "text/plain"));

        json.StatusCode.Should().Be(HttpStatusCode.Accepted);
        beacon.StatusCode.Should().Be(HttpStatusCode.Accepted);
        JsonElement payload = await json.Content.ReadFromJsonAsync<JsonElement>();
        payload.GetProperty("stored").GetBoolean().Should().BeTrue();

        await using ApplicationDbContext db = CreateDbContext();
        (await db.ClientErrors.Select(row => row.Path).ToListAsync()).Should().OnlyContain(path => path == "/quiz");
    }

    [Fact]
    public async Task Post_InvalidPayloads_Return400AndStoreNothing()
    {
        using HttpResponseMessage badSource = await _client.PostAsJsonAsync("/client-errors", new { source = "console", message = "x", path = "/", sessionId = "s" });
        using HttpResponseMessage absolutePath = await _client.PostAsJsonAsync("/client-errors", new { source = "window", message = "x", path = "https://evil.example/", sessionId = "s" });
        using HttpResponseMessage notJson = await _client.PostAsync("/client-errors", new StringContent("not json", Encoding.UTF8, "text/plain"));
        using HttpResponseMessage empty = await _client.PostAsync("/client-errors", new StringContent("", Encoding.UTF8, "text/plain"));

        badSource.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        absolutePath.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        notJson.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        empty.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await RowCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Post_OversizedBody_Returns413AndStoresNothing()
    {
        using HttpResponseMessage response = await _client.PostAsJsonAsync(
            "/client-errors", Body("s-big", new string('x', ReportClientError.MaxBodyBytes + 10)));

        response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
        (await RowCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Post_RotatingForwardedForAndSessionId_DoesNotEscapeTheRateLimit()
    {
        List<HttpStatusCode> statuses = [];
        for (int attempt = 0; attempt < 40; attempt++)
        {
            using HttpRequestMessage request = new(HttpMethod.Post, "/client-errors")
            {
                Content = JsonContent.Create(Body($"spoof-{attempt}"))
            };
            request.Headers.Add("X-Forwarded-For", $"203.0.113.{attempt + 1}");
            using HttpResponseMessage response = await _client.SendAsync(request);
            statuses.Add(response.StatusCode);
        }

        statuses.Take(30).Should().OnlyContain(status => status == HttpStatusCode.Accepted);
        statuses.Skip(30).Should().OnlyContain(status => status == HttpStatusCode.TooManyRequests);
        (await RowCountAsync()).Should().Be(30);
    }

    [Fact]
    public async Task Post_BeyondRateLimit_Returns429AndStoresNothingMore()
    {
        List<HttpStatusCode> statuses = [];
        for (int attempt = 0; attempt < 31; attempt++)
        {
            // A new session per request, so only the rate limiter (not the per-session cap) can stop it.
            using HttpResponseMessage response = await _client.PostAsJsonAsync("/client-errors", Body($"flood-{attempt}"));
            statuses.Add(response.StatusCode);
        }

        statuses.Take(30).Should().OnlyContain(status => status == HttpStatusCode.Accepted);
        statuses[^1].Should().Be(HttpStatusCode.TooManyRequests);
        (await RowCountAsync()).Should().Be(30);
    }
}
