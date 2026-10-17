using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Analytics;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>
/// ANALYTICS-001 (#121) over real HTTP: the production JWT bearer configuration and "Admin" policy
/// decide 401/403/200, and page hits are written and reported through the real endpoints.
/// </summary>
public sealed class InternalTrafficHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private const string BrowserUserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        Mock<IIpGeolocationService> geolocation = new();
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddSingleton(geolocation.Object);
                services.AddSingleton<IAttributionClassifier, AttributionClassifier>();
                services.AddScoped<IValidator<SetUserInternalFlag.Request>, SetUserInternalFlag.Validator>();
            },
            app =>
            {
                new TrackPageView.Endpoint().MapEndpoint(app);
                new SetUserInternalFlag.Endpoint().MapEndpoint(app);
                new GetPageViewSessions.Endpoint().MapEndpoint(app);
                new GetPageViewSessionDetail.Endpoint().MapEndpoint(app);
                new GetPageViewAnalytics.Endpoint().MapEndpoint(app);
                new AdminUsersActivity.Endpoint().MapEndpoint(app);
            });
        _host.Client.DefaultRequestHeaders.UserAgent.ParseAdd(BrowserUserAgent);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private string AdminToken() => _host.CreateToken("admin-subject", "admin@example.com", AdminGroups);

    private string UserToken(string subject = "member-subject", string email = "member@example.com") =>
        _host.CreateToken(subject, email);

    private async Task<HttpStatusCode> SendAsync(HttpMethod method, string path, string? token, object? body = null)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            method, path, token, body is null ? null : JsonContent.Create(body));
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return response.StatusCode;
    }

    private async Task<JsonElement> GetJsonAsync(string path, string token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, path, token);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, "GET {0} should succeed for an admin", path);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private Task<HttpStatusCode> TrackAsync(string sessionId, string path, string? token = null, bool? internalBrowser = null) =>
        SendAsync(HttpMethod.Post, "/analytics/page-views", token, new { path, queryString = "", sessionId, internalBrowser });

    private static HashSet<string> SessionIds(JsonElement sessionsResponse) =>
        sessionsResponse.GetProperty("sessions").EnumerateArray()
            .Select(session => session.GetProperty("sessionId").GetString()!)
            .ToHashSet();

    [Fact]
    public async Task SetUserInternalFlag_WithoutToken_Returns401()
    {
        User member = await SeedMemberAsync();

        HttpStatusCode status = await SendAsync(HttpMethod.Put, $"/admin/users/{member.Id}/internal", null, new { isInternal = true });

        status.Should().Be(HttpStatusCode.Unauthorized);
        (await ReloadAsync(member.Id)).IsInternal.Should().BeFalse();
    }

    [Fact]
    public async Task SetUserInternalFlag_AsNonAdmin_Returns403AndLeavesFlagUnchanged()
    {
        User member = await SeedMemberAsync();

        HttpStatusCode status = await SendAsync(
            HttpMethod.Put, $"/admin/users/{member.Id}/internal", UserToken("other-subject", "other@example.com"), new { isInternal = true });

        status.Should().Be(HttpStatusCode.Forbidden);
        (await ReloadAsync(member.Id)).IsInternal.Should().BeFalse();
        (await DbContext.Audits.AsNoTracking().CountAsync(log => log.Action == AuditAction.UserInternalFlagChanged)).Should().Be(0);
    }

    [Fact]
    public async Task SetUserInternalFlag_WithExpiredOrForeignAdminToken_Returns401()
    {
        User member = await SeedMemberAsync();
        string expired = _host.CreateToken("admin-subject", "admin@example.com", AdminGroups, expiresUtc: DateTime.UtcNow.AddMinutes(-10));
        string foreignIssuer = _host.CreateToken("admin-subject", "admin@example.com", AdminGroups, issuer: "https://attacker.invalid");

        (await SendAsync(HttpMethod.Put, $"/admin/users/{member.Id}/internal", expired, new { isInternal = true }))
            .Should().Be(HttpStatusCode.Unauthorized);
        (await SendAsync(HttpMethod.Put, $"/admin/users/{member.Id}/internal", foreignIssuer, new { isInternal = true }))
            .Should().Be(HttpStatusCode.Unauthorized);
        (await ReloadAsync(member.Id)).IsInternal.Should().BeFalse();
    }

    [Fact]
    public async Task SetUserInternalFlag_AsAdmin_Returns200AndAuditsTheChange()
    {
        User member = await SeedMemberAsync();

        HttpStatusCode status = await SendAsync(HttpMethod.Put, $"/admin/users/{member.Id}/internal", AdminToken(), new { isInternal = true });

        status.Should().Be(HttpStatusCode.OK);
        (await ReloadAsync(member.Id)).IsInternal.Should().BeTrue();
        (await DbContext.Audits.AsNoTracking().CountAsync(log => log.Action == AuditAction.UserInternalFlagChanged)).Should().Be(1);
    }

    [Theory]
    [InlineData("/admin/page-view-sessions?days=1")]
    [InlineData("/admin/page-view-sessions/some-session")]
    [InlineData("/admin/page-view-analytics?days=1")]
    [InlineData("/admin/users?days=1")]
    [InlineData("/admin/users/00000000-0000-0000-0000-000000000001/page-view-history?days=1")]
    public async Task AdminReports_RejectAnonymousAndNonAdminCallers(string path)
    {
        (await SendAsync(HttpMethod.Get, path, null)).Should().Be(HttpStatusCode.Unauthorized);
        (await SendAsync(HttpMethod.Get, path, UserToken())).Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task InternalTraffic_IsFlaggedAtWriteTime_ExcludedPerSession_AndRetroactivelyByUserFlag()
    {
        string laterFlaggedToken = UserToken("later-subject", "later@example.com");

        // An ordinary anonymous visitor.
        (await TrackAsync("s-visitor", "/")).Should().Be(HttpStatusCode.Created);
        (await TrackAsync("s-visitor", "/categories")).Should().Be(HttpStatusCode.Created);
        // An anonymous browser carrying the internal marker.
        (await TrackAsync("s-marker", "/categories/science", internalBrowser: true)).Should().Be(HttpStatusCode.Created);
        // Starts anonymous, then signs in as an admin in the same session.
        (await TrackAsync("s-mid", "/")).Should().Be(HttpStatusCode.Created);
        (await TrackAsync("s-mid", "/collections", AdminToken())).Should().Be(HttpStatusCode.Created);
        // A member who is not internal yet.
        (await TrackAsync("s-later", "/", laterFlaggedToken)).Should().Be(HttpStatusCode.Created);
        (await TrackAsync("s-later", "/collections", laterFlaggedToken)).Should().Be(HttpStatusCode.Created);

        // Write-time flags: admin hit and marker hit only.
        Dictionary<string, bool[]> flagsBySession = (await DbContext.PageViews.AsNoTracking().ToListAsync())
            .GroupBy(pageView => pageView.SessionId)
            .ToDictionary(group => group.Key, group => group.OrderBy(pageView => pageView.CreatedUtc).Select(pageView => pageView.IsInternal).ToArray());
        flagsBySession["s-visitor"].Should().Equal(false, false);
        flagsBySession["s-marker"].Should().Equal(true);
        flagsBySession["s-mid"].Should().Equal(false, true);
        flagsBySession["s-later"].Should().Equal(false, false);

        // Default report: the marked and mid-session sign-in sessions are excluded in full.
        JsonElement report = await GetJsonAsync("/admin/page-view-sessions?days=1", AdminToken());
        SessionIds(report).Should().BeEquivalentTo(["s-visitor", "s-later"]);
        report.GetProperty("summary").GetProperty("internalSessions").GetInt32().Should().Be(2);
        report.GetProperty("summary").GetProperty("internalExcluded").GetBoolean().Should().BeTrue();

        // Flag the member internal through the admin endpoint.
        JsonElement users = await GetJsonAsync("/admin/users?days=1", AdminToken());
        string laterUserId = users.GetProperty("users").EnumerateArray()
            .Single(user => user.GetProperty("email").GetString() == "later@example.com")
            .GetProperty("id").GetString()!;
        (await SendAsync(HttpMethod.Put, $"/admin/users/{laterUserId}/internal", AdminToken(), new { isInternal = true }))
            .Should().Be(HttpStatusCode.OK);

        // Retroactive: the member's earlier session disappears, and no hit was rewritten.
        report = await GetJsonAsync("/admin/page-view-sessions?days=1", AdminToken());
        SessionIds(report).Should().BeEquivalentTo(["s-visitor"]);
        report.GetProperty("summary").GetProperty("internalSessions").GetInt32().Should().Be(3);
        (await DbContext.PageViews.AsNoTracking().Where(pageView => pageView.SessionId == "s-later").AllAsync(pageView => !pageView.IsInternal))
            .Should().BeTrue();

        // includeInternal=true brings every session back and marks the internal ones.
        JsonElement included = await GetJsonAsync("/admin/page-view-sessions?days=1&includeInternal=true", AdminToken());
        SessionIds(included).Should().BeEquivalentTo(["s-visitor", "s-marker", "s-mid", "s-later"]);
        included.GetProperty("summary").GetProperty("internalExcluded").GetBoolean().Should().BeFalse();
        included.GetProperty("sessions").EnumerateArray()
            .Where(session => session.GetProperty("isInternal").GetBoolean())
            .Select(session => session.GetProperty("sessionId").GetString())
            .Should().BeEquivalentTo(["s-marker", "s-mid", "s-later"]);

        // Session detail hides internal sessions unless asked.
        (await SendAsync(HttpMethod.Get, "/admin/page-view-sessions/s-later", AdminToken())).Should().Be(HttpStatusCode.NotFound);
        (await SendAsync(HttpMethod.Get, "/admin/page-view-sessions/s-later?includeInternal=true", AdminToken())).Should().Be(HttpStatusCode.OK);
        (await SendAsync(HttpMethod.Get, "/admin/page-view-sessions/s-visitor", AdminToken())).Should().Be(HttpStatusCode.OK);

        // Page analytics reports the same exclusion.
        JsonElement analytics = await GetJsonAsync("/admin/page-view-analytics?days=1", AdminToken());
        analytics.GetProperty("summary").GetProperty("internalSessions").GetInt32().Should().Be(3);
        analytics.GetProperty("summary").GetProperty("internalExcluded").GetBoolean().Should().BeTrue();
    }

    private async Task<User> SeedMemberAsync()
    {
        User member = new() { Id = Guid.NewGuid(), Subject = "member-subject", Email = "member@example.com", Name = "Member" };
        DbContext.Users.Add(member);
        await DbContext.SaveChangesAsync();
        DbContext.ChangeTracker.Clear();
        return member;
    }

    private Task<User> ReloadAsync(Guid userId) =>
        DbContext.Users.AsNoTracking().SingleAsync(user => user.Id == userId);
}
