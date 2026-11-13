using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Admin.DailyDigest;
using Quizymode.Api.Features.Analytics;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using static Quizymode.Api.Tests.Features.Admin.DailyDigest.DigestSeed;

namespace Quizymode.Api.Tests.Features.Admin.DailyDigest;

/// <summary>#573: write-time traffic classes and the reads that exclude and count them.</summary>
public sealed class TrafficClassDigestTests : DatabaseTestFixture
{
    private static readonly DateTime Mid = Start.AddHours(10);
    private const string ChromeUa = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    private const string E2eUa = ChromeUa + " QuizymodeE2E/test-1";

    private readonly Mock<IUserContext> _userContext = new();

    public TrafficClassDigestTests()
    {
        _userContext.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContext.SetupGet(context => context.UserId).Returns((string?)null);
    }

    private async Task<DaySummary> BuildAsync()
    {
        List<VisitorCohortReport.CohortRow> rows = await VisitorCohortReport.LoadRowsAsync(DbContext, false, false, CancellationToken.None);
        return await DailySummaryBuilder.BuildDayAsync(DbContext, Start, End, rows, true, NullLogger.Instance, CancellationToken.None);
    }

    private static DefaultHttpContext Http(string userAgent)
    {
        DefaultHttpContext context = new();
        context.Request.Headers.UserAgent = userAgent;
        context.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("198.51.100.30");
        return context;
    }

    private async Task TrackHitAsync(string userAgent, string sessionId, bool? internalBrowser = null)
    {
        Mock<IIpGeolocationService> geo = new();
        geo.Setup(g => g.GetCountryAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((string?)null);
        var result = await TrackPageView.HandleAsync(
            new TrackPageView.Request("/", null, sessionId, InternalBrowser: internalBrowser),
            Http(userAgent),
            DbContext,
            _userContext.Object,
            new AttributionClassifier(),
            geo.Object,
            CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
    }

    // Write paths

    [Fact]
    public async Task PageView_WithTheE2EToken_IsAutomatedAndInternal_BeforeAndAfterSignIn()
    {
        await TrackHitAsync(E2eUa, "anon-e2e");

        Guid user = Guid.NewGuid();
        _userContext.SetupGet(context => context.IsAuthenticated).Returns(true);
        _userContext.SetupGet(context => context.UserId).Returns(user.ToString());
        await TrackHitAsync(E2eUa, "anon-e2e");

        List<PageView> hits = await DbContext.PageViews.ToListAsync();
        hits.Should().HaveCount(2);
        hits.Should().OnlyContain(hit => hit.TrafficClass == TrafficClassifier.Automated && hit.IsInternal);
    }

    [Fact]
    public async Task PageView_OrdinaryVisitorMarkedBrowserAdminAndBot_GetTheirOwnClass()
    {
        await TrackHitAsync(ChromeUa, "visitor");
        await TrackHitAsync(ChromeUa, "marked", internalBrowser: true);
        await TrackHitAsync("Googlebot/2.1", "bot");
        _userContext.SetupGet(context => context.IsAdmin).Returns(true);
        await TrackHitAsync(ChromeUa, "admin");

        Dictionary<string, PageView> bySession = await DbContext.PageViews.ToDictionaryAsync(hit => hit.SessionId);
        bySession["visitor"].TrafficClass.Should().Be(TrafficClassifier.Audience);
        bySession["visitor"].IsInternal.Should().BeFalse();
        bySession["marked"].TrafficClass.Should().Be(TrafficClassifier.Maintainer);
        bySession["marked"].IsInternal.Should().BeTrue();
        bySession["bot"].TrafficClass.Should().Be(TrafficClassifier.KnownBot);
        bySession["bot"].IsBot.Should().BeTrue();
        bySession["bot"].IsInternal.Should().BeFalse();
        bySession["admin"].TrafficClass.Should().Be(TrafficClassifier.Maintainer);
    }

    [Fact]
    public async Task AnalyticsEvents_AreClassifiedLikePageViews()
    {
        TrackAnalyticsEvents.Request request = new(
            "ev-1",
            [new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.QuickQuizStarted, "/", RunId: "r")]);

        var result = await TrackAnalyticsEvents.HandleAsync(request, Http(E2eUa), DbContext, _userContext.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        AnalyticsEvent stored = await DbContext.AnalyticsEvents.SingleAsync();
        stored.TrafficClass.Should().Be(TrafficClassifier.Automated);
        stored.IsInternal.Should().BeTrue();
    }

    // Excluded counts

    [Fact]
    public async Task ExcludedCounts_AreSessionsPerClass_WithPrecedenceAndLegacyMapping()
    {
        Guid staff = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = staff, Subject = "staff", IsInternal = true, CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) });
        DbContext.PageViews.AddRange(
            Hit("aud", Mid, trafficClass: TrafficClassifier.Audience),
            Hit("auto", Mid, isInternal: true, trafficClass: TrafficClassifier.Automated),
            Hit("auto", Mid.AddMinutes(1), isInternal: true, trafficClass: TrafficClassifier.Automated),
            // One automated hit makes the whole session automated, even beside maintainer and bot hits.
            Hit("mixed", Mid, isInternal: true, trafficClass: TrafficClassifier.Maintainer),
            Hit("mixed", Mid.AddMinutes(1), isInternal: true, trafficClass: TrafficClassifier.Automated),
            Hit("mixed", Mid.AddMinutes(2), isBot: true, trafficClass: TrafficClassifier.KnownBot),
            Hit("maint", Mid, isInternal: true, trafficClass: TrafficClassifier.Maintainer),
            Hit("staffuser", Mid, userId: staff, trafficClass: TrafficClassifier.Audience),
            Hit("bot-new", Mid, isBot: true, trafficClass: TrafficClassifier.KnownBot),
            // Rows written before traffic classes existed.
            Hit("bot-old", Mid, isBot: true),
            Hit("legacy", Mid, isInternal: true));
        await DbContext.SaveChangesAsync();

        ExcludedSessionCounts counts = await TrafficExclusions.CountAsync(DbContext, Start, End, CancellationToken.None);

        counts.Automated.Should().Be(2);
        counts.KnownBot.Should().Be(2);
        counts.Maintainer.Should().Be(2);
        counts.InternalUnsplit.Should().Be(1);
        counts.Total.Should().Be(7);

        DaySummary day = await BuildAsync();
        day.Visits!.Sessions.Should().Be(1);
        DigestHealth health = await DailySummaryBuilder.BuildHealthAsync(DbContext, Start, End, CancellationToken.None);
        health.Excluded.Should().Be(counts);
    }

    [Fact]
    public async Task OneBotHit_ExcludesTheWholeSession()
    {
        DbContext.PageViews.AddRange(
            Hit("s1", Mid, trafficClass: TrafficClassifier.Audience),
            Hit("s1", Mid.AddMinutes(1), "/quiz", isBot: true, trafficClass: TrafficClassifier.KnownBot));
        await DbContext.SaveChangesAsync();

        (await BuildAsync()).Visits!.Sessions.Should().Be(0);
    }

    [Fact]
    public async Task Overview_ReportsTheSameExcludedCountsAsTheDigestForTheSameWindow()
    {
        DateTime now = new(2026, 10, 16, 12, 0, 0, DateTimeKind.Utc);
        DbContext.PageViews.AddRange(
            Hit("aud", now.AddHours(-2), trafficClass: TrafficClassifier.Audience),
            Hit("auto", now.AddHours(-3), isInternal: true, trafficClass: TrafficClassifier.Automated),
            Hit("maint", now.AddHours(-4), isInternal: true, trafficClass: TrafficClassifier.Maintainer),
            Hit("bot", now.AddHours(-5), isBot: true, trafficClass: TrafficClassifier.KnownBot));
        await DbContext.SaveChangesAsync();

        var result = await GetAnalyticsOverview.HandleAsync(new GetAnalyticsOverview.QueryRequest(7), DbContext, now, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Current.HumanSessions.Should().Be(1);
        result.Value.Excluded.Should().Be(new ExcludedSessionCounts(1, 1, 1, 0));
    }

    // New accounts

    [Fact]
    public async Task NewAccounts_ExcludeAFirstAutomatedOrMaintainerSession_ButKeepUnlinkedAndAudienceAccounts()
    {
        Guid autoUser = Guid.NewGuid();
        Guid maintUser = Guid.NewGuid();
        Guid audienceUser = Guid.NewGuid();
        Guid unlinked = Guid.NewGuid();
        Guid flagged = Guid.NewGuid();
        DbContext.Users.AddRange(
            new User { Id = autoUser, Subject = "a", CreatedAt = Mid },
            new User { Id = maintUser, Subject = "m", CreatedAt = Mid },
            new User { Id = audienceUser, Subject = "u", CreatedAt = Mid },
            new User { Id = unlinked, Subject = "n", CreatedAt = Mid },
            new User { Id = flagged, Subject = "f", CreatedAt = Mid, IsInternal = true });
        DbContext.AnalyticsSessions.AddRange(
            Session("s-auto", Mid, "v1", userId: autoUser),
            Session("s-maint", Mid, "v2", userId: maintUser),
            Session("s-aud", Mid, "v3", userId: audienceUser));
        DbContext.PageViews.AddRange(
            Hit("s-auto", Mid, isInternal: true, trafficClass: TrafficClassifier.Automated),
            Hit("s-maint", Mid, isInternal: true, trafficClass: TrafficClassifier.Maintainer),
            Hit("s-aud", Mid, trafficClass: TrafficClassifier.Audience));
        await DbContext.SaveChangesAsync();

        List<(Guid Id, DateTime CreatedAt)> accounts = await DailySummaryBuilder.LoadNewAccountsAsync(DbContext, Start, End, CancellationToken.None);

        accounts.Select(account => account.Id).Should().BeEquivalentTo([audienceUser, unlinked]);
        (await BuildAsync()).Accounts!.NewAccounts.Should().Be(2);
    }

    [Fact]
    public async Task SignedInOrdinaryUser_WritesAudienceAndIsNotInternal()
    {
        Guid ordinary = Guid.NewGuid();
        _userContext.SetupGet(context => context.IsAuthenticated).Returns(true);
        _userContext.SetupGet(context => context.UserId).Returns(ordinary.ToString());
        await TrackHitAsync(ChromeUa, "signed-in");

        PageView hit = await DbContext.PageViews.SingleAsync();
        hit.TrafficClass.Should().Be(TrafficClassifier.Audience);
        hit.IsInternal.Should().BeFalse();
        hit.IsAuthenticated.Should().BeTrue();
    }

    [Fact]
    public async Task SignedInOrdinaryUser_IsCountedOnceInTheDigest()
    {
        Guid ordinary = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = ordinary, Subject = "ordinary", CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) });
        DbContext.AnalyticsSessions.Add(Session("signed", Mid, userId: ordinary));
        DbContext.PageViews.AddRange(
            Hit("signed", Mid, userId: ordinary, trafficClass: TrafficClassifier.Audience),
            Hit("signed", Mid.AddMinutes(1), userId: ordinary, trafficClass: TrafficClassifier.Audience));
        await DbContext.SaveChangesAsync();

        DaySummary day = await BuildAsync();

        day.Visits!.Sessions.Should().Be(1);
        day.Visits.PageViews.Should().Be(2);
        day.Accounts!.ActiveAccounts.Should().Be(1);
        day.Accounts.AuthenticatedSessions.Should().Be(1);
    }

    // Feedback and picture reports

    [Fact]
    public async Task Feedback_IsFilteredBySessionClass_AndOpenBacklogStaysUnfiltered()
    {
        DbContext.PageViews.AddRange(
            Hit("fb-aud", Mid, trafficClass: TrafficClassifier.Audience),
            Hit("fb-auto", Mid, isInternal: true, trafficClass: TrafficClassifier.Automated),
            Hit("fb-bot", Mid, isBot: true, trafficClass: TrafficClassifier.KnownBot));
        DbContext.FeedbackSubmissions.AddRange(
            Feedback("fb-aud", "reportIssue"),
            Feedback("fb-auto", "reportIssue"),
            Feedback("fb-bot", "generalFeedback"),
            Feedback(null, "generalFeedback"));
        await DbContext.SaveChangesAsync();

        DaySummary day = await BuildAsync();

        day.Problems!.ProblemReports.Should().Be(1);
        day.Problems.OtherFeedback.Should().Be(1);

        DailyDigestComposer composer = new(DbContext, new FakeClock(End.AddHours(2)), NullLogger<DailyDigestComposer>.Instance);
        DigestReport report = await composer.ComposeDailyAsync(new DateOnly(2026, 11, 6), TimeZoneInfo.FindSystemTimeZoneById("America/Chicago"), CancellationToken.None);
        report.Waiting!.NewFeedback.Should().Be(4);
    }

    [Fact]
    public async Task PictureReports_CountAudienceAndUnclassified_NotMaintainerAutomatedOrBot()
    {
        foreach (string? trafficClass in new string?[] { null, TrafficClassifier.Audience, TrafficClassifier.Maintainer, TrafficClassifier.Automated, TrafficClassifier.KnownBot })
        {
            DbContext.MediaReports.Add(new MediaReport
            {
                Id = Guid.NewGuid(), ItemId = Guid.NewGuid(), AssetId = Guid.NewGuid(), Revision = 1, Slot = "question",
                Category = "other", AbuseKey = Guid.NewGuid().ToString("N"), CreatedAt = Mid, TrafficClass = trafficClass
            });
        }

        await DbContext.SaveChangesAsync();

        (await BuildAsync()).Problems!.PictureReports.Should().Be(2);
    }

    private static FeedbackSubmission Feedback(string? sessionId, string type) => new()
    {
        Id = Guid.NewGuid(), Type = type, PageUrl = "/", Details = "d", SessionId = sessionId, CreatedAt = Mid
    };

    // Sources

    [Theory]
    [InlineData("social", "www.linkedin.com", null, "LinkedIn")]
    [InlineData("social", "lnkd.in", null, "LinkedIn")]
    [InlineData("campaign", null, "LinkedIn", "LinkedIn")]
    [InlineData("social", "medium.com", null, "Medium")]
    [InlineData("social", "blog.medium.com", null, "Medium")]
    [InlineData("campaign", null, "medium", "Medium")]
    [InlineData("direct", null, null, "Direct / unknown")]
    [InlineData("shared-link", null, null, "Shared link")]
    [InlineData("search", "google.com", null, "google.com")]
    public void SourceKey_NamesLinkedInAndMedium_AndShowsDirectAsDirectOrUnknown(string channel, string? referrer, string? utmSource, string expected)
    {
        DailySummaryBuilder.SourceKey(utmSource, referrer, channel).Should().Be(expected);
    }

    [Fact]
    public async Task Sources_ListTopTenThenOther_SoTheTableAddsUp_AndOmitZeroRows()
    {
        for (int i = 0; i < 12; i++)
        {
            string id = $"src-{i}";
            DbContext.AnalyticsSessions.Add(Session(id, Mid, $"v{i}", channel: "referral", referrerHost: $"site{i:00}.example.com"));
            DbContext.PageViews.Add(Hit(id, Mid, trafficClass: TrafficClassifier.Audience));
        }

        DbContext.AnalyticsSessions.Add(Session("src-direct", Mid, "vd"));
        DbContext.PageViews.Add(Hit("src-direct", Mid, trafficClass: TrafficClassifier.Audience));
        await DbContext.SaveChangesAsync();

        SourcesSection sources = (await BuildAsync()).Sources!;

        sources.Top.Should().HaveCount(10);
        sources.Other.Should().NotBeNull();
        (sources.Top.Sum(row => row.Sessions) + sources.Other!.Sessions).Should().Be(13);
        sources.Top.Should().OnlyContain(row => row.Sessions > 0);
    }

    [Fact]
    public async Task Sources_SessionWithoutAnAttributionRow_IsDirectOrUnknown()
    {
        DbContext.PageViews.Add(Hit("no-attribution", Mid, trafficClass: TrafficClassifier.Audience));
        await DbContext.SaveChangesAsync();

        (await BuildAsync()).Sources!.Top.Single().Name.Should().Be("Direct / unknown");
    }

    // Locations

    [Fact]
    public async Task Locations_ListTopTenThenOtherThenUnknown_AndLocalAndMissingAreUnknown()
    {
        for (int i = 0; i < 12; i++)
        {
            string id = $"loc-{i}";
            DbContext.AnalyticsSessions.Add(Session(id, Mid, $"v{i}", country: $"C{i:00}", region: "Texas"));
            DbContext.PageViews.Add(Hit(id, Mid));
        }

        DbContext.AnalyticsSessions.Add(Session("loc-local", Mid, "vl", country: "Local"));
        DbContext.AnalyticsSessions.Add(Session("loc-none", Mid, "vn"));
        DbContext.PageViews.AddRange(Hit("loc-local", Mid), Hit("loc-none", Mid), Hit("loc-no-row", Mid));
        await DbContext.SaveChangesAsync();

        LocationsSection locations = (await BuildAsync()).Locations!;

        locations.Countries.Top.Should().HaveCount(10);
        locations.Countries.Other.Should().Be(2);
        locations.Countries.Unknown.Should().Be(3);
        locations.Countries.Top.Select(row => row.Name).Should().NotContain("Local");
        locations.Regions.Top.Should().HaveCount(10).And.Contain(new LocationRow("Texas, C00", 1));
        locations.Regions.Other.Should().Be(2);
        locations.Regions.Unknown.Should().Be(3);
    }

    [Fact]
    public async Task Locations_ExcludeMaintainerAutomatedAndBotSessions()
    {
        DbContext.AnalyticsSessions.AddRange(
            Session("l-aud", Mid, "v1", country: "US"),
            Session("l-auto", Mid, "v2", country: "SG"));
        DbContext.PageViews.AddRange(
            Hit("l-aud", Mid, trafficClass: TrafficClassifier.Audience),
            Hit("l-auto", Mid, isInternal: true, trafficClass: TrafficClassifier.Automated));
        await DbContext.SaveChangesAsync();

        (await BuildAsync()).Locations!.Countries.Top.Should().ContainSingle().Which.Name.Should().Be("US");
    }

    // Baseline

    [Fact]
    public async Task Baseline_LeavesOutDaysBeforeTheRulesChange_AndNamesTheDateInTheFooter()
    {
        TimeZoneInfo chicago = TimeZoneInfo.FindSystemTimeZoneById("America/Chicago");
        (DateTime d1, _) = DailyDigestWindow.ForDate(new DateOnly(2026, 11, 5), chicago);
        (DateTime d2, _) = DailyDigestWindow.ForDate(new DateOnly(2026, 11, 3), chicago);
        DbContext.PageViews.AddRange(Hit("old-1", d2.AddHours(3)), Hit("new-1", d1.AddHours(3)), Hit("cur", Start.AddHours(3)));
        await DbContext.SaveChangesAsync();

        DailyDigestComposer composer = new(DbContext, new FakeClock(End.AddHours(2)), NullLogger<DailyDigestComposer>.Instance, new DateOnly(2026, 11, 4));
        DigestReport report = await composer.ComposeDailyAsync(new DateOnly(2026, 11, 6), chicago, CancellationToken.None);

        report.Baseline!.Days.Should().Be(2);
        report.Baseline.RulesChangedOn.Should().Be(new DateOnly(2026, 11, 4));
        DailyDigestRenderer.Body(report, null).Should().Contain("Traffic rules changed on 2026-11-04");
    }
}
