using System.Net;
using System.Text.Json;
using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetClientErrorsTests : DatabaseTestFixture
{
    private const string Chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    private const string IPhone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

    private static ClientError Error(
        string fingerprint,
        string sessionId,
        DateTime occurredUtc,
        string path = "/",
        string? appVersion = "3.58.0",
        string userAgent = Chrome,
        bool isBot = false,
        bool isInternal = false,
        Guid? userId = null) => new()
    {
        Id = Guid.NewGuid(),
        Fingerprint = fingerprint,
        Source = "window",
        ErrorName = "TypeError",
        Message = $"message {fingerprint}",
        Stack = $"stack {fingerprint} {occurredUtc:O}",
        Path = path,
        AppVersion = appVersion,
        SessionId = sessionId,
        UserId = userId,
        UserAgent = userAgent,
        DeviceClass = UserAgentClassifier.DeviceClass(userAgent),
        IsBot = isBot,
        IsInternal = isInternal,
        OccurredUtc = occurredUtc
    };

    private async Task<GetClientErrors.Response> Query(GetClientErrors.QueryRequest request)
    {
        var result = await GetClientErrors.HandleAsync(request, DbContext, CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        return result.Value!;
    }

    [Fact]
    public async Task HandleAsync_GroupsByFingerprintWithCountsSessionsPathsAndMix()
    {
        DateTime now = DateTime.UtcNow;
        DbContext.ClientErrors.AddRange(
            Error("aaa", "s1", now.AddHours(-3), "/quiz", "3.57.0"),
            Error("aaa", "s2", now.AddHours(-2), "/quiz", "3.58.0", IPhone),
            Error("aaa", "s5", now.AddHours(-1), "/categories", null),
            Error("bbb", "s3", now.AddMinutes(-5), "/"),
            Error("old", "s4", now.AddDays(-30)));
        await DbContext.SaveChangesAsync();

        GetClientErrors.Response response = await Query(new GetClientErrors.QueryRequest(Days: 7));

        response.TotalReports.Should().Be(4);
        response.TotalGroups.Should().Be(2);
        GetClientErrors.GroupResponse top = response.Groups[0];
        top.Fingerprint.Should().Be("aaa");
        top.Count.Should().Be(3);
        top.Sessions.Should().Be(3);
        top.LatestAppVersion.Should().Be("3.58.0");
        top.TopPaths.Should().Equal(new GetClientErrors.ValueCount("/quiz", 2), new GetClientErrors.ValueCount("/categories", 1));
        top.Browsers.Should().BeEquivalentTo([new GetClientErrors.ValueCount("Chrome", 2), new GetClientErrors.ValueCount("Safari", 1)]);
        top.Devices.Should().BeEquivalentTo([new GetClientErrors.ValueCount("desktop", 2), new GetClientErrors.ValueCount("mobile", 1)]);
        top.SampleSessionId.Should().Be("s5");
        top.SampleStack.Should().StartWith("stack aaa");
        top.FirstSeenUtc.Should().BeCloseTo(now.AddHours(-3), TimeSpan.FromSeconds(1));
        top.LastSeenUtc.Should().BeCloseTo(now.AddHours(-1), TimeSpan.FromSeconds(1));
        response.AppVersions.Should().Equal("3.58.0", "3.57.0");
    }

    [Fact]
    public async Task HandleAsync_FirstSeenLooksBeyondTheWindowAndCountsNewGroups()
    {
        DateTime now = DateTime.UtcNow;
        DbContext.ClientErrors.AddRange(
            Error("recurring", "s-old", now.AddDays(-20)),
            Error("recurring", "s1", now.AddHours(-1)),
            Error("fresh", "s2", now.AddHours(-1)));
        await DbContext.SaveChangesAsync();

        GetClientErrors.Response response = await Query(new GetClientErrors.QueryRequest(Days: 7));

        response.NewGroups.Should().Be(1);
        response.Groups.Single(group => group.Fingerprint == "recurring").IsNew.Should().BeFalse();
        response.Groups.Single(group => group.Fingerprint == "recurring").FirstSeenUtc.Should().BeCloseTo(now.AddDays(-20), TimeSpan.FromSeconds(1));
        response.Groups.Single(group => group.Fingerprint == "fresh").IsNew.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_ExcludesBotAndInternalSessionsByDefault()
    {
        DateTime now = DateTime.UtcNow;
        Guid flaggedUserId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = flaggedUserId, Subject = "flagged", Email = "flagged@example.com", Name = "Flagged", IsInternal = true });
        DbContext.PageViews.Add(new PageView
        {
            Id = Guid.NewGuid(),
            SessionId = "s-pv-internal",
            Path = "/",
            QueryString = "",
            Url = "/",
            IpAddress = "127.0.0.1",
            IsInternal = true,
            CreatedUtc = now.AddHours(-1)
        });
        DbContext.ClientErrors.AddRange(
            Error("x", "s-visitor", now.AddHours(-1)),
            Error("x", "s-bot", now.AddHours(-1), isBot: true),
            Error("x", "s-marker", now.AddHours(-1), isInternal: true),
            Error("x", "s-flagged", now.AddHours(-1), userId: flaggedUserId),
            Error("x", "s-pv-internal", now.AddHours(-1)));
        await DbContext.SaveChangesAsync();

        GetClientErrors.Response defaults = await Query(new GetClientErrors.QueryRequest(Days: 1));
        GetClientErrors.Response everything = await Query(new GetClientErrors.QueryRequest(Days: 1, IncludeBots: true, IncludeInternal: true));

        defaults.Groups.Single().Count.Should().Be(1);
        defaults.Groups.Single().SampleSessionId.Should().Be("s-visitor");
        defaults.BotReports.Should().Be(1);
        defaults.BotsExcluded.Should().BeTrue();
        defaults.InternalSessions.Should().Be(3);
        defaults.InternalExcluded.Should().BeTrue();
        everything.Groups.Single().Count.Should().Be(5);
    }

    [Fact]
    public async Task HandleAsync_FiltersByAppVersionAndValidatesInput()
    {
        DateTime now = DateTime.UtcNow;
        DbContext.ClientErrors.AddRange(
            Error("a", "s1", now.AddHours(-1), appVersion: "3.57.0"),
            Error("b", "s2", now.AddHours(-1), appVersion: "3.58.0"));
        await DbContext.SaveChangesAsync();

        GetClientErrors.Response filtered = await Query(new GetClientErrors.QueryRequest(Days: 1, AppVersion: "3.58.0"));
        filtered.Groups.Select(group => group.Fingerprint).Should().Equal("b");
        filtered.AppVersions.Should().Equal("3.58.0", "3.57.0");

        (await GetClientErrors.HandleAsync(new GetClientErrors.QueryRequest(Days: 0), DbContext, CancellationToken.None)).IsFailure.Should().BeTrue();
        (await GetClientErrors.HandleAsync(new GetClientErrors.QueryRequest(Days: 400), DbContext, CancellationToken.None)).IsFailure.Should().BeTrue();
        (await GetClientErrors.HandleAsync(new GetClientErrors.QueryRequest(AppVersion: "1.0; drop"), DbContext, CancellationToken.None)).IsFailure.Should().BeTrue();
    }

    [Fact]
    public void Aggregate_OrdersByCountThenRecencyAndPicksLatestSample()
    {
        DateTime windowStart = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
        GetClientErrors.Row Row(string fingerprint, string session, int hour, string? version = "1.0.0") => new(
            fingerprint, "promise", "Error", "m", $"stack-{hour}", null, "/", version, session, Chrome, "desktop", windowStart.AddHours(hour));

        List<GetClientErrors.GroupResponse> groups = GetClientErrors.Aggregate(
            [Row("one", "a", 1), Row("two", "b", 2), Row("two", "b", 5, null), Row("three", "c", 9)],
            new Dictionary<string, DateTime>(),
            windowStart);

        groups.Select(group => group.Fingerprint).Should().Equal("two", "three", "one");
        groups[0].Count.Should().Be(2);
        groups[0].Sessions.Should().Be(1);
        groups[0].SampleStack.Should().Be("stack-5");
        groups[0].LatestAppVersion.Should().Be("1.0.0");
        groups.Should().OnlyContain(group => group.IsNew);
    }
}

/// <summary>Real JWT bearer + "Admin" policy: the client errors report is admin-only.</summary>
public sealed class GetClientErrorsHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            _ => { },
            app => new GetClientErrors.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<HttpResponseMessage> GetAsync(string? token, string path = "/admin/client-errors?days=7")
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, path, token);
        return await _host.Client.SendAsync(request);
    }

    [Fact]
    public async Task ClientErrors_RequiresAdmin()
    {
        using HttpResponseMessage anonymous = await GetAsync(null);
        using HttpResponseMessage member = await GetAsync(_host.CreateToken("member", "member@example.com"));
        using HttpResponseMessage admin = await GetAsync(_host.CreateToken("admin", "admin@example.com", ["Admins"]));
        using HttpResponseMessage badDays = await GetAsync(_host.CreateToken("admin", "admin@example.com", ["Admins"]), "/admin/client-errors?days=0");

        anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        member.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        admin.StatusCode.Should().Be(HttpStatusCode.OK);
        badDays.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        JsonElement body = JsonDocument.Parse(await admin.Content.ReadAsStringAsync()).RootElement;
        body.GetProperty("groups").GetArrayLength().Should().Be(0);
    }
}
