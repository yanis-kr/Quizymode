using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>Daily rollups, retention pruning, and the long-range rollup report (ANALYTICS-011).</summary>
public sealed class PageViewRetentionServiceTests : DatabaseTestFixture
{
    private static readonly DateTime Now = new(2026, 10, 16, 12, 0, 0, DateTimeKind.Utc);
    private static readonly DateOnly Yesterday = new(2026, 10, 15);
    private static readonly DateOnly TwoDaysAgo = new(2026, 10, 14);

    private static PageView Hit(
        string sessionId,
        string path,
        DateTime createdUtc,
        bool isAuthenticated = false,
        bool isBot = false,
        bool isInternal = false,
        bool classify = true)
    {
        PageView pageView = new()
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            IpAddress = "198.51.100.10",
            Path = path,
            QueryString = string.Empty,
            Url = path,
            UserAgent = "Mozilla/5.0",
            IsAuthenticated = isAuthenticated,
            IsBot = isBot,
            IsInternal = isInternal,
            CreatedUtc = createdUtc
        };

        if (classify)
        {
            PageViewClassificationBackfill.Apply(pageView, PageHitClassifier.Classify(path, string.Empty));
        }

        return pageView;
    }

    private static AnalyticsSession Snapshot(string sessionId, DateTime firstSeenUtc, string? visitorId = null, string channel = "search") =>
        new()
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            VisitorId = visitorId,
            FirstSeenUtc = firstSeenUtc,
            LandingPath = "/",
            Channel = channel,
            DeviceClass = "desktop",
            Country = "US",
            CreatedUtc = firstSeenUtc
        };

    private static DateTime At(DateOnly day, int hour, int minute = 0) =>
        day.ToDateTime(new TimeOnly(hour, minute), DateTimeKind.Utc);

    [Fact]
    public async Task RunAsync_RollsUpCompleteDaysByAreaScopeAndSession()
    {
        string visitor = Guid.NewGuid().ToString();
        DbContext.AnalyticsSessions.AddRange(
            Snapshot("first-visit", At(TwoDaysAgo, 9), visitor),
            Snapshot("study", At(Yesterday, 10), visitor),
            Snapshot("browse", At(Yesterday, 11)));
        DbContext.PageViews.AddRange(
            Hit("first-visit", "/", At(TwoDaysAgo, 9)),
            Hit("study", "/quiz/geography", At(Yesterday, 10)),
            Hit("study", "/quiz/geography/item/a", At(Yesterday, 10, 1)),
            Hit("study", "/quiz/science/item/b", At(Yesterday, 10, 2)),
            Hit("study", "/items/abc", At(Yesterday, 10, 3)),
            // Not yet backfilled: classified during the run.
            Hit("browse", "/categories/history", At(Yesterday, 11), classify: false),
            // Excluded: bot hit and internal session.
            Hit("crawler", "/", At(Yesterday, 12), isBot: true),
            Hit("staff", "/quiz/geography/item/z", At(Yesterday, 13), isInternal: true),
            // Today is not complete yet, so it is not rolled up.
            Hit("today", "/", Now.AddHours(-1)));
        await DbContext.SaveChangesAsync();
        DbContext.ChangeTracker.Clear();

        PageViewRetentionService.RunResult result = await PageViewRetentionService.RunAsync(DbContext, Now, CancellationToken.None);

        result.DaysRolledUp.Should().Be(2);
        List<PageViewDailyRollup> rows = await DbContext.PageViewDailyRollups.AsNoTracking().ToListAsync();
        rows.Should().NotContain(row => row.Day == DateOnly.FromDateTime(Now));

        List<PageViewDailyRollup> yesterday = rows.Where(row => row.Day == Yesterday).ToList();
        List<PageViewDailyRollup> totals = yesterday.Where(row => row.Area == PageViewRetentionService.AreaAll).ToList();
        totals.Sum(row => row.Sessions).Should().Be(2);
        totals.Sum(row => row.Hits).Should().Be(5);
        totals.Sum(row => row.ItemSteps).Should().Be(2);
        totals.Sum(row => row.BouncedSessions).Should().Be(1);
        totals.Single(row => row.Channel == "search" && row.Sessions == 1 && row.Hits == 4).VisitorType.Should().Be("returning");
        totals.Single(row => row.Hits == 1).VisitorType.Should().Be("unknown");

        PageViewDailyRollup quizTotal = yesterday.Single(row => row.Area == "quiz" && row.ScopeType == PageViewRetentionService.ScopeAll);
        quizTotal.Sessions.Should().Be(1);
        quizTotal.Hits.Should().Be(3);
        quizTotal.ItemSteps.Should().Be(2);

        // Area totals add up to session-total hits.
        yesterday.Where(row => row.ScopeType == PageViewRetentionService.ScopeAll).Sum(row => row.Hits).Should().Be(5);

        yesterday.Should().Contain(row => row.Area == "quiz" && row.ScopeType == "category" && row.ScopeKey == "geography" && row.Hits == 2);
        yesterday.Should().Contain(row => row.Area == "browse" && row.ScopeType == "category" && row.ScopeKey == "history");
        // Item scope is not kept in rollups.
        yesterday.Should().NotContain(row => row.ScopeType == "item");
        yesterday.Single(row => row.Area == "item-detail" && row.ScopeType == null).Hits.Should().Be(1);

        rows.Single(row => row.Day == TwoDaysAgo && row.Area == PageViewRetentionService.AreaAll).VisitorType.Should().Be("new");
    }

    [Fact]
    public async Task RunAsync_IsIdempotent()
    {
        DbContext.PageViews.Add(Hit("s", "/", At(Yesterday, 8)));
        await DbContext.SaveChangesAsync();

        await PageViewRetentionService.RunAsync(DbContext, Now, CancellationToken.None);
        int rowCount = await DbContext.PageViewDailyRollups.CountAsync();

        PageViewRetentionService.RunResult second = await PageViewRetentionService.RunAsync(DbContext, Now, CancellationToken.None);

        second.DaysRolledUp.Should().Be(0);
        (await DbContext.PageViewDailyRollups.CountAsync()).Should().Be(rowCount);

        // Re-rolling a day replaces its rows rather than duplicating them.
        await PageViewRetentionService.RollUpDayAsync(DbContext, Yesterday, Now, CancellationToken.None);
        (await DbContext.PageViewDailyRollups.CountAsync()).Should().Be(rowCount);
    }

    [Fact]
    public async Task RunAsync_PrunesRawHitsAndOrphanSessionsOlderThanRetention_AfterRollingThemUp()
    {
        DateTime old = Now.AddDays(-(PageViewRetentionService.RetentionDays + 5));
        DateTime recent = Now.AddDays(-10);
        DbContext.AnalyticsSessions.AddRange(
            Snapshot("old-session", old),
            // Started before the cutoff but still has a recent hit: kept.
            Snapshot("long-session", old));
        DbContext.PageViews.AddRange(
            Hit("old-session", "/quiz/geography/item/a", old),
            Hit("long-session", "/", old),
            Hit("long-session", "/categories", recent),
            Hit("recent-session", "/", recent));
        await DbContext.SaveChangesAsync();
        DbContext.ChangeTracker.Clear();

        PageViewRetentionService.RunResult result = await PageViewRetentionService.RunAsync(DbContext, Now, CancellationToken.None);

        result.HitsDeleted.Should().Be(2);
        result.SessionsDeleted.Should().Be(1);
        (await DbContext.PageViews.CountAsync()).Should().Be(2);
        (await DbContext.PageViews.AnyAsync(hit => hit.CreatedUtc < Now.AddDays(-PageViewRetentionService.RetentionDays))).Should().BeFalse();
        (await DbContext.AnalyticsSessions.Select(session => session.SessionId).ToListAsync()).Should().Equal("long-session");

        // The pruned day survives as a rollup.
        DateOnly oldDay = DateOnly.FromDateTime(old);
        (await DbContext.PageViewDailyRollups.AnyAsync(row => row.Day == oldDay && row.Area == "quiz" && row.ItemSteps == 1)).Should().BeTrue();
    }

    [Fact]
    public async Task RollupReport_ReturnsDailyAreaAndDimensionTotals()
    {
        DbContext.AnalyticsSessions.Add(Snapshot("study", At(Yesterday, 10), channel: "paid"));
        DbContext.PageViews.AddRange(
            Hit("study", "/quiz/geography", At(Yesterday, 10)),
            Hit("study", "/quiz/geography/item/a", At(Yesterday, 10, 1)),
            Hit("study", "/explore/geography/item/a", At(Yesterday, 10, 2)),
            Hit("other", "/", At(TwoDaysAgo, 10)));
        await DbContext.SaveChangesAsync();
        await PageViewRetentionService.RunAsync(DbContext, Now, CancellationToken.None);

        var result = await GetPageViewRollups.HandleAsync(new GetPageViewRollups.QueryRequest(Days: 365), DbContext, Now, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        GetPageViewRollups.Response response = result.Value!;
        response.RetentionDays.Should().Be(180);
        response.WindowEndDay.Should().Be(Yesterday);
        response.LatestRolledDay.Should().Be(Yesterday);
        response.TotalSessionDays.Should().Be(2);
        response.TotalHits.Should().Be(4);
        response.TotalItemSteps.Should().Be(2);
        response.Daily.Select(day => day.Day).Should().Equal(TwoDaysAgo, Yesterday);
        response.Areas.Sum(area => area.Hits).Should().Be(response.TotalHits);
        response.Areas.Single(area => area.Area == "quiz").SessionDays.Should().Be(1);
        response.Channels.Single(channel => channel.Value == "paid").SessionDays.Should().Be(1);
        response.Channels.Single(channel => channel.Value == "unknown").SessionDays.Should().Be(1);
        response.TopScopes.Single(scope => scope.ScopeKey == "geography").Hits.Should().Be(3);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(731)]
    public async Task RollupReport_RejectsOutOfRangeDays(int days)
    {
        var result = await GetPageViewRollups.HandleAsync(new GetPageViewRollups.QueryRequest(days), DbContext, Now, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
    }

    [Fact]
    public async Task RawReports_RejectWindowsLongerThanRetention()
    {
        Mock<IIpGeolocationService> geo = new();

        var pages = await GetPageViewAnalytics.HandleAsync(
            new GetPageViewAnalytics.QueryRequest(Days: 181), DbContext, geo.Object, CancellationToken.None);
        var sessions = await GetPageViewSessions.HandleAsync(
            new GetPageViewSessions.QueryRequest(Days: 181), DbContext, geo.Object, CancellationToken.None);

        pages.IsFailure.Should().BeTrue();
        sessions.IsFailure.Should().BeTrue();
    }
}
