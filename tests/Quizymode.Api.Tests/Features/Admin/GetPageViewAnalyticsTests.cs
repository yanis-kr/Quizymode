using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetPageViewAnalyticsTests : DatabaseTestFixture
{
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

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, CancellationToken.None);

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

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Summary.TotalPageViews.Should().Be(1);
        result.Value.TopPages.Should().ContainSingle(page => page.Path == "/categories/history");
        result.Value.RecentPageViews.Should().ContainSingle(view => view.Path == "/categories/history");
    }

    [Fact]
    public async Task HandleAsync_InvalidVisitorType_ReturnsValidationError()
    {
        GetPageViewAnalytics.QueryRequest request = new(Days: 7, VisitorType: "members-only");

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_InvalidDays_ReturnsValidationError()
    {
        GetPageViewAnalytics.QueryRequest request = new(Days: 0);

        var result = await GetPageViewAnalytics.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
    }
}
