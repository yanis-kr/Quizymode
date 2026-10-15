using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Analytics;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>
/// FUNNEL-001 (#106) over real HTTP: the production JWT bearer configuration and "Admin" policy decide
/// who can read the funnel, and events are written through the real endpoint. The rate limit is covered
/// separately in <c>TrackAnalyticsEventsTests</c>.
/// </summary>
public sealed class ConversionFunnelHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private const string BrowserUserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services => services.AddScoped<IValidator<TrackAnalyticsEvents.Request>, TrackAnalyticsEvents.Validator>(),
            app =>
            {
                new TrackAnalyticsEvents.Endpoint().MapEndpoint(app);
                new GetConversionFunnel.Endpoint().MapEndpoint(app);
            });
        _host.Client.DefaultRequestHeaders.UserAgent.ParseAdd(BrowserUserAgent);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private string AdminToken() => _host.CreateToken("admin-subject", "admin@example.com", AdminGroups);

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string? token, object? body = null)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path, token, body is null ? null : JsonContent.Create(body));
        return await _host.Client.SendAsync(request);
    }

    private static object QuizRun(string sessionId, string runId, bool? internalBrowser = null) => new
    {
        sessionId,
        internalBrowser,
        events = new object[]
        {
            new { name = AnalyticsEventCatalog.QuickQuizStarted, path = "/", contextType = "home", runId, total = 5 },
            new { name = AnalyticsEventCatalog.QuizCompleted, path = "/", contextType = "home", runId, score = 4, total = 5 }
        }
    };

    [Fact]
    public async Task Funnel_RejectsAnonymousExpiredAndNonAdminCallers()
    {
        string expiredAdmin = _host.CreateToken("admin-subject", "admin@example.com", AdminGroups, expiresUtc: DateTime.UtcNow.AddMinutes(-10));

        using HttpResponseMessage anonymous = await SendAsync(HttpMethod.Get, "/admin/analytics/funnel", null);
        using HttpResponseMessage expired = await SendAsync(HttpMethod.Get, "/admin/analytics/funnel", expiredAdmin);
        using HttpResponseMessage member = await SendAsync(HttpMethod.Get, "/admin/analytics/funnel", _host.CreateToken("member", "member@example.com"));
        using HttpResponseMessage admin = await SendAsync(HttpMethod.Get, "/admin/analytics/funnel", AdminToken());

        anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        expired.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        member.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        admin.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Events_AreAcceptedFromAnyoneAndInternalTrafficIsExcludedFromTheFunnel()
    {
        using HttpResponseMessage visitor = await SendAsync(HttpMethod.Post, "/analytics/events", null, QuizRun("s-visitor", "run-visitor"));
        using HttpResponseMessage marked = await SendAsync(HttpMethod.Post, "/analytics/events", null, QuizRun("s-marked", "run-marked", internalBrowser: true));
        using HttpResponseMessage admin = await SendAsync(HttpMethod.Post, "/analytics/events", AdminToken(), QuizRun("s-admin", "run-admin"));
        using HttpResponseMessage retry = await SendAsync(HttpMethod.Post, "/analytics/events", null, QuizRun("s-visitor", "run-visitor"));
        using HttpResponseMessage unknown = await SendAsync(HttpMethod.Post, "/analytics/events", null, new
        {
            sessionId = "s-visitor",
            events = new[] { new { name = "not_an_event", path = "/" } }
        });

        visitor.StatusCode.Should().Be(HttpStatusCode.Accepted);
        marked.StatusCode.Should().Be(HttpStatusCode.Accepted);
        admin.StatusCode.Should().Be(HttpStatusCode.Accepted);
        (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("duplicates").GetInt32().Should().Be(2);
        unknown.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await DbContext.AnalyticsEvents.AsNoTracking().Where(analyticsEvent => analyticsEvent.IsInternal).Select(analyticsEvent => analyticsEvent.SessionId).Distinct().ToListAsync())
            .Should().BeEquivalentTo(["s-marked", "s-admin"]);

        using HttpResponseMessage response = await SendAsync(HttpMethod.Get, "/admin/analytics/funnel?days=1", AdminToken());
        JsonElement funnel = await response.Content.ReadFromJsonAsync<JsonElement>();
        funnel.GetProperty("sessionsWithEvents").GetInt32().Should().Be(1);
        funnel.GetProperty("internalSessions").GetInt32().Should().Be(2);
        JsonElement completed = funnel.GetProperty("steps").EnumerateArray()
            .Single(step => step.GetProperty("eventName").GetString() == AnalyticsEventCatalog.QuizCompleted);
        completed.GetProperty("sessions").GetInt32().Should().Be(1);
        completed.GetProperty("conversionFromPreviousPercent").GetDouble().Should().Be(100.0);
    }
}
