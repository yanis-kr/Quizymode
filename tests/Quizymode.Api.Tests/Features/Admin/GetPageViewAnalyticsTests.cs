using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetPageViewAnalyticsTests : DatabaseTestFixture
{
    private static IIpGeolocationService NullGeoService()
    {
        var mock = new Mock<IIpGeolocationService>();
        mock.Setup(g => g.GetCountryAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        return mock.Object;
    }

    [Fact]
    public async Task HandleAsync_ReturnsSummaryTopPagesAndRecentHits()
    {
        Guid authUserId = Guid.NewGuid();
        User user = new()
        {
            Id = authUserId,
            Subject = "subject-1",
            Email = "admin@example.com",
            Name = "Admin User",
            CreatedAt = DateTime.UtcNow.AddDays(-5),
            LastLogin = DateTime.UtcNow
        };

        await DbContext.Users.AddAsync(user);
        await DbContext.PageViews.AddRangeAsync(
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = authUserId,
                IsAuthenticated = true,
                SessionId = "auth-session-1",
                IpAddress = "203.0.113.10",
                Path = "/categories/science",
                QueryString = string.Empty,
                Url = "/categories/science",
                CreatedUtc = DateTime.UtcNow.AddHours(-1)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = authUserId,
                IsAuthenticated = true,
                SessionId = "auth-session-1",
                IpAddress = "203.0.113.10",
                Path = "/categories/science",
                QueryString = "?sort=popular",
                Url = "/categories/science?sort=popular",
                CreatedUtc = DateTime.UtcNow.AddMinutes(-30)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = null,
                IsAuthenticated = false,
                SessionId = "anon-session-1",
                IpAddress = "198.51.100.33",
                Path = "/collections",
                QueryString = string.Empty,
                Url = "/collections",
                CreatedUtc = DateTime.UtcNow.AddMinutes(-10)
            });
        await DbContext.SaveChangesAsync();

        GetPageViewAnalytics.QueryRequest request = new(Days: 7, VisitorType: "all", Page: 1, PageSize: 10, TopPagesLimit: 5);

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value!.Summary.TotalPageViews.Should().Be(3);
        result.Value.Summary.UniquePages.Should().Be(2);
        result.Value.Summary.UniqueSessions.Should().Be(2);
        result.Value.Summary.AuthenticatedPageViews.Should().Be(2);
        result.Value.Summary.AnonymousPageViews.Should().Be(1);

        result.Value.TopPages.Should().HaveCount(2);
        result.Value.TopPages[0].Path.Should().Be("/categories/science");
        result.Value.TopPages[0].TotalViews.Should().Be(2);
        result.Value.TopPages[0].UniqueSessions.Should().Be(1);

        result.Value.RecentPageViews.Should().HaveCount(3);
        result.Value.RecentPageViews[0].Url.Should().Be("/collections");
        result.Value.RecentPageViews[0].IsAuthenticated.Should().BeFalse();
        result.Value.RecentPageViews[1].UserEmail.Should().Be("admin@example.com");
    }

    [Fact]
    public async Task HandleAsync_AppliesVisitorAndPathFilters()
    {
        await DbContext.PageViews.AddRangeAsync(
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = null,
                IsAuthenticated = false,
                SessionId = "anon-session-1",
                IpAddress = "198.51.100.1",
                Path = "/categories/history",
                QueryString = string.Empty,
                Url = "/categories/history",
                CreatedUtc = DateTime.UtcNow.AddHours(-2)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = null,
                IsAuthenticated = false,
                SessionId = "anon-session-2",
                IpAddress = "198.51.100.2",
                Path = "/collections",
                QueryString = string.Empty,
                Url = "/collections",
                CreatedUtc = DateTime.UtcNow.AddHours(-1)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = Guid.NewGuid(),
                IsAuthenticated = true,
                SessionId = "auth-session-1",
                IpAddress = "203.0.113.5",
                Path = "/categories/science",
                QueryString = string.Empty,
                Url = "/categories/science",
                CreatedUtc = DateTime.UtcNow.AddMinutes(-30)
            });
        await DbContext.SaveChangesAsync();

        GetPageViewAnalytics.QueryRequest request = new(Days: 7, VisitorType: "anonymous", PathContains: "categories", Page: 1, PageSize: 10, TopPagesLimit: 5);

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Summary.TotalPageViews.Should().Be(1);
        result.Value.TopPages.Should().ContainSingle(page => page.Path == "/categories/history");
        result.Value.RecentPageViews.Should().ContainSingle(view => view.Path == "/categories/history");
    }

    [Fact]
    public async Task HandleAsync_InvalidVisitorType_ReturnsValidationError()
    {
        GetPageViewAnalytics.QueryRequest request = new(Days: 7, VisitorType: "members-only");

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, NullGeoService(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_InvalidDays_ReturnsValidationError()
    {
        GetPageViewAnalytics.QueryRequest request = new(Days: 0);

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, NullGeoService(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_SessionThatSignsInMidVisitIsCountedOnce()
    {
        DateTime now = DateTime.UtcNow;
        Guid userId = Guid.NewGuid();

        await DbContext.PageViews.AddRangeAsync(
            // One session that starts anonymous and then authenticates.
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = null,
                IsAuthenticated = false,
                SessionId = "converting-session",
                IpAddress = "198.51.100.7",
                Path = "/",
                QueryString = string.Empty,
                Url = "/",
                CreatedUtc = now.AddMinutes(-20)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                IsAuthenticated = true,
                SessionId = "converting-session",
                IpAddress = "198.51.100.7",
                Path = "/collections",
                QueryString = string.Empty,
                Url = "/collections",
                CreatedUtc = now.AddMinutes(-15)
            });
        await DbContext.SaveChangesAsync();

        GetPageViewAnalytics.QueryRequest request = new(Days: 7, VisitorType: "all");

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        GetPageViewAnalytics.SummaryResponse summary = result.Value!.Summary;

        summary.UniqueSessions.Should().Be(1);
        // Previously this session was counted in both buckets, so the two summed to 2.
        (summary.AuthenticatedSessions + summary.AnonymousSessions).Should().Be(summary.UniqueSessions);
        // Classified by its first hit, which was anonymous.
        summary.AnonymousSessions.Should().Be(1);
        summary.AuthenticatedSessions.Should().Be(0);
        // Per-hit counts are unchanged.
        summary.AuthenticatedPageViews.Should().Be(1);
        summary.AnonymousPageViews.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_ExcludesBotTrafficByDefault()
    {
        DateTime now = DateTime.UtcNow;

        await DbContext.PageViews.AddRangeAsync(
            new PageView
            {
                Id = Guid.NewGuid(),
                IsAuthenticated = false,
                SessionId = "human-session",
                IpAddress = "198.51.100.9",
                Path = "/categories",
                QueryString = string.Empty,
                Url = "/categories",
                UserAgent = "Mozilla/5.0",
                IsBot = false,
                CreatedUtc = now.AddMinutes(-10)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                IsAuthenticated = false,
                SessionId = "crawler-session",
                IpAddress = "66.249.66.1",
                Path = "/categories",
                QueryString = string.Empty,
                Url = "/categories",
                UserAgent = "Googlebot/2.1",
                IsBot = true,
                CreatedUtc = now.AddMinutes(-5)
            });
        await DbContext.SaveChangesAsync();

        var excluded = await GetPageViewAnalytics.HandleAsync(
            new GetPageViewAnalytics.QueryRequest(Days: 7),
            DbContext,
            NullGeoService(),
            CancellationToken.None);

        excluded.Value!.Summary.TotalPageViews.Should().Be(1);
        excluded.Value.Summary.BotSessions.Should().Be(1);
        excluded.Value.Summary.BotsExcluded.Should().BeTrue();

        var included = await GetPageViewAnalytics.HandleAsync(
            new GetPageViewAnalytics.QueryRequest(Days: 7, IncludeBots: true),
            DbContext,
            NullGeoService(),
            CancellationToken.None);

        included.Value!.Summary.TotalPageViews.Should().Be(2);
        included.Value.Summary.BotsExcluded.Should().BeFalse();
    }
}
