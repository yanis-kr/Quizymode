using System.Net;
using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>ANALYTICS-002 (#122) acquisition report and ANALYTICS-003 (#123) returning-visitor metrics.</summary>
public sealed class GetAcquisitionReportTests : DatabaseTestFixture
{
    private static readonly DateTime Now = DateTime.UtcNow;

    private static PageView Hit(string sessionId, string path, DateTime createdUtc, Guid? userId = null, bool isBot = false, bool isInternal = false) => new()
    {
        Id = Guid.NewGuid(),
        SessionId = sessionId,
        UserId = userId,
        IsAuthenticated = userId is not null,
        IpAddress = "198.51.100.10",
        Path = path,
        QueryString = string.Empty,
        Url = path,
        UserAgent = "Mozilla/5.0",
        IsBot = isBot,
        IsInternal = isInternal,
        CreatedUtc = createdUtc
    };

    private static AnalyticsSession Session(
        string sessionId,
        DateTime firstSeenUtc,
        string channel = "direct",
        string? visitorId = null,
        Guid? userId = null,
        string deviceClass = "desktop",
        string? country = "US",
        string? utmSource = null,
        string? utmCampaign = null) => new()
    {
        Id = Guid.NewGuid(),
        SessionId = sessionId,
        VisitorId = visitorId,
        UserId = userId,
        FirstSeenUtc = firstSeenUtc,
        LandingPath = "/",
        Channel = channel,
        DeviceClass = deviceClass,
        Country = country,
        UtmSource = utmSource,
        UtmCampaign = utmCampaign,
        CreatedUtc = firstSeenUtc
    };

    private Task<Result<GetAcquisitionReport.Response>> Run(GetAcquisitionReport.QueryRequest request) =>
        GetAcquisitionReport.HandleAsync(request, DbContext, CancellationToken.None);

    private static IIpGeolocationService NullGeoService()
    {
        Mock<IIpGeolocationService> mock = new();
        mock.Setup(g => g.GetCountryAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((string?)null);
        return mock.Object;
    }

    [Fact]
    public async Task Channels_AggregateSessionsBySourceAndCampaign_AndMatchSessionsTabTotals()
    {
        DbContext.PageViews.AddRange(
            Hit("paid-1", "/quiz/math", Now.AddHours(-3)),
            Hit("paid-1", "/collections", Now.AddHours(-3).AddMinutes(1)),
            Hit("paid-2", "/quiz/math", Now.AddHours(-2)),
            Hit("direct-1", "/", Now.AddHours(-1)),
            Hit("bot-1", "/", Now.AddHours(-1), isBot: true),
            Hit("internal-1", "/", Now.AddHours(-1), isInternal: true));
        DbContext.AnalyticsSessions.AddRange(
            Session("paid-1", Now.AddHours(-3), "paid", utmSource: "reddit", utmCampaign: "launch", deviceClass: "mobile"),
            Session("paid-2", Now.AddHours(-2), "paid", utmSource: "reddit", utmCampaign: "launch", deviceClass: "mobile", country: "CA"),
            Session("direct-1", Now.AddHours(-1)),
            Session("bot-1", Now.AddHours(-1)),
            Session("internal-1", Now.AddHours(-1)));
        await DbContext.SaveChangesAsync();

        Result<GetAcquisitionReport.Response> result = await Run(new GetAcquisitionReport.QueryRequest());

        result.IsSuccess.Should().BeTrue();
        GetAcquisitionReport.Response report = result.Value;
        report.TotalSessions.Should().Be(3);
        report.BotSessions.Should().Be(1);
        report.InternalSessions.Should().Be(1);

        GetAcquisitionReport.ChannelRowResponse paid = report.Channels.Single(row => row.Channel == "paid");
        paid.Sessions.Should().Be(2);
        paid.BounceRatePercent.Should().Be(50);
        paid.EngagedRatePercent.Should().Be(50);
        paid.SourceBreakdown.Should().ContainSingle(row => row.UtmSource == "reddit" && row.UtmCampaign == "launch" && row.Sessions == 2);
        report.DeviceBreakdown.Single(row => row.DeviceClass == "mobile").Sessions.Should().Be(2);
        report.CountryBreakdown.Single(row => row.Country == "CA").Sessions.Should().Be(1);

        var sessionsTab = await GetPageViewSessions.HandleAsync(
            new GetPageViewSessions.QueryRequest(), DbContext, NullGeoService(), CancellationToken.None);
        sessionsTab.Value.Summary.TotalSessions.Should().Be(report.TotalSessions);
    }

    [Fact]
    public async Task Filters_DeviceAndCountry_NarrowTheWholeReport()
    {
        DbContext.PageViews.AddRange(Hit("m-us", "/", Now.AddHours(-2)), Hit("m-ca", "/", Now.AddHours(-2)), Hit("d-us", "/", Now.AddHours(-2)));
        DbContext.AnalyticsSessions.AddRange(
            Session("m-us", Now.AddHours(-2), deviceClass: "mobile", country: "US"),
            Session("m-ca", Now.AddHours(-2), deviceClass: "mobile", country: "CA"),
            Session("d-us", Now.AddHours(-2), deviceClass: "desktop", country: "US"));
        await DbContext.SaveChangesAsync();

        Result<GetAcquisitionReport.Response> result = await Run(new GetAcquisitionReport.QueryRequest(DeviceClass: "mobile", Country: "us"));

        result.Value.TotalSessions.Should().Be(1);
        result.Value.Channels.Single().Sessions.Should().Be(1);
    }

    [Fact]
    public async Task Visitors_SplitNewFromReturning_AndMeasureSevenDayReturnByChannel()
    {
        string returning = Guid.NewGuid().ToString();
        string oneTime = Guid.NewGuid().ToString();
        string older = Guid.NewGuid().ToString();

        DbContext.AnalyticsSessions.AddRange(
            // First visit in window via paid/launch, returns two days later.
            Session("r-1", Now.AddDays(-5), "paid", returning, utmCampaign: "launch"),
            Session("r-2", Now.AddDays(-3), "direct", returning),
            // First visit in window, never returns.
            Session("o-1", Now.AddDays(-4), "paid", oneTime, utmCampaign: "launch"),
            // First visit before the window, returns inside it.
            Session("old-1", Now.AddDays(-30), "search", older),
            Session("old-2", Now.AddDays(-1), "direct", older),
            // No visitor id (GPC).
            Session("anon-1", Now.AddDays(-1)));
        await DbContext.SaveChangesAsync();

        Result<GetAcquisitionReport.Response> result = await Run(new GetAcquisitionReport.QueryRequest(Days: 7));

        VisitorCohortReport.Response visitors = result.Value.Visitors;
        visitors.NewVisitorSessions.Should().Be(2);
        visitors.ReturningVisitorSessions.Should().Be(2);
        visitors.UnidentifiedSessions.Should().Be(1);
        visitors.NewVisitors.Should().Be(2);
        visitors.ReturningVisitors.Should().Be(1);
        VisitorCohortReport.ReturnRateRow launch = visitors.ReturnWithin7Days.Single();
        launch.Channel.Should().Be("paid");
        launch.UtmCampaign.Should().Be("launch");
        launch.FirstTimeVisitors.Should().Be(2);
        launch.ReturnedWithin7Days.Should().Be(1);
        launch.ReturnRatePercent.Should().Be(50);
    }

    [Fact]
    public async Task Visitors_TwoAnonymousDaysThenSignupOnThirdDay_ShowTwoPreSignupSessionsAndTwoDays()
    {
        string visitorId = Guid.NewGuid().ToString();
        DateTime dayThree = Now.AddMinutes(-10);
        DateTime dayOne = dayThree.AddDays(-2);

        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = userId, Subject = "sub-signup", Email = "signup@example.com", CreatedAt = dayThree.AddMinutes(1) });
        DbContext.AnalyticsSessions.AddRange(
            Session("day-1", dayOne, "social", visitorId),
            Session("day-2", dayOne.AddDays(1), "direct", visitorId),
            // The signup session starts anonymous and links to the account on sign-in.
            Session("day-3", dayThree, "direct", visitorId, userId));
        await DbContext.SaveChangesAsync();

        Result<GetAcquisitionReport.Response> result = await Run(new GetAcquisitionReport.QueryRequest(Days: 7));

        VisitorCohortReport.Response visitors = result.Value.Visitors;
        visitors.SignupsWithVisitorHistory.Should().Be(1);
        visitors.MedianPreSignupSessions.Should().Be(2);
        visitors.MedianDaysToSignup.Should().Be(2);
    }

    [Fact]
    public async Task Visitors_LinkedToInternalUser_AreExcludedAcrossAllTheirSessions()
    {
        Guid internalUserId = Guid.NewGuid();
        string visitorId = Guid.NewGuid().ToString();
        DbContext.Users.Add(new User { Id = internalUserId, Subject = "sub-internal", Email = "staff@example.com", IsInternal = true });
        DbContext.PageViews.AddRange(
            Hit("staff-anon", "/", Now.AddDays(-2)),
            Hit("staff-signed-in", "/", Now.AddDays(-1), userId: internalUserId),
            Hit("guest", "/", Now.AddDays(-1)));
        DbContext.AnalyticsSessions.AddRange(
            Session("staff-anon", Now.AddDays(-2), "paid", visitorId),
            Session("staff-signed-in", Now.AddDays(-1), "direct", visitorId, internalUserId),
            Session("guest", Now.AddDays(-1), "direct", Guid.NewGuid().ToString()));
        await DbContext.SaveChangesAsync();

        Result<GetAcquisitionReport.Response> result = await Run(new GetAcquisitionReport.QueryRequest(Days: 7));

        result.Value.TotalSessions.Should().Be(1);
        result.Value.Channels.Should().ContainSingle(row => row.Channel == "direct");
        result.Value.InternalSessions.Should().Be(2);
        result.Value.Visitors.NewVisitors.Should().Be(1);
    }

    [Fact]
    public async Task InvalidDays_ReturnsValidationFailure()
    {
        Result<GetAcquisitionReport.Response> result = await Run(new GetAcquisitionReport.QueryRequest(Days: 0));

        result.IsFailure.Should().BeTrue();
    }
}

/// <summary>Only admins can read the acquisition report, checked over real HTTP.</summary>
public sealed class AcquisitionReportHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(CreateDbContext, _ => { }, app => new GetAcquisitionReport.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<HttpStatusCode> GetAsync(string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/admin/analytics/acquisition?days=7", token);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return response.StatusCode;
    }

    [Fact]
    public async Task AcquisitionReport_RejectsAnonymousAndNonAdminCallers()
    {
        (await GetAsync(null)).Should().Be(HttpStatusCode.Unauthorized);
        (await GetAsync(_host.CreateToken("member", "member@example.com"))).Should().Be(HttpStatusCode.Forbidden);
        (await GetAsync(_host.CreateToken("admin", "admin@example.com", AdminGroups))).Should().Be(HttpStatusCode.OK);
    }
}
