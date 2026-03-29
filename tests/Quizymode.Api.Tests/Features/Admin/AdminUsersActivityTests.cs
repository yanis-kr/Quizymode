using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class AdminUsersActivityTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleGetUsersAsync_ReturnsRegisteredUsersWithActivityMetrics()
    {
        Guid activeUserId = Guid.NewGuid();
        Guid inactiveUserId = Guid.NewGuid();

        await DbContext.Users.AddRangeAsync(
            new User
            {
                Id = activeUserId,
                Subject = "subject-active",
                Email = "active@example.com",
                Name = "Active User",
                CreatedAt = DateTime.UtcNow.AddDays(-20),
                LastLogin = DateTime.UtcNow.AddDays(-1)
            },
            new User
            {
                Id = inactiveUserId,
                Subject = "subject-inactive",
                Email = "inactive@example.com",
                Name = "Inactive User",
                CreatedAt = DateTime.UtcNow.AddDays(-5),
                LastLogin = DateTime.UtcNow.AddDays(-2)
            });

        await DbContext.PageViews.AddRangeAsync(
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = activeUserId,
                IsAuthenticated = true,
                SessionId = "session-1",
                IpAddress = "203.0.113.10",
                Path = "/categories/science",
                QueryString = string.Empty,
                Url = "/categories/science",
                CreatedUtc = DateTime.UtcNow.AddDays(-3)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = activeUserId,
                IsAuthenticated = true,
                SessionId = "session-1",
                IpAddress = "203.0.113.10",
                Path = "/categories/science",
                QueryString = "?view=items",
                Url = "/categories/science?view=items",
                CreatedUtc = DateTime.UtcNow.AddDays(-2)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = activeUserId,
                IsAuthenticated = true,
                SessionId = "session-2",
                IpAddress = "203.0.113.11",
                Path = "/collections",
                QueryString = string.Empty,
                Url = "/collections",
                CreatedUtc = DateTime.UtcNow.AddDays(-1)
            });

        await DbContext.SaveChangesAsync();

        AdminUsersActivity.UsersQueryRequest request = new(
            Search: "example.com",
            ActivityDays: 30,
            ActivityFilter: "all",
            Page: 1,
            PageSize: 10);

        Result<AdminUsersActivity.UsersResponse> result =
            await AdminUsersActivity.HandleGetUsersAsync(request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value!.Summary.TotalRegisteredUsers.Should().Be(2);
        result.Value.Summary.FilteredUsers.Should().Be(2);
        result.Value.Summary.UsersWithActivityInWindow.Should().Be(1);
        result.Value.Summary.UsersWithoutActivityInWindow.Should().Be(1);
        result.Value.Users.Should().HaveCount(2);
        result.Value.Users[0].Email.Should().Be("active@example.com");
        result.Value.Users[0].UniqueUrlsInWindow.Should().Be(3);
        result.Value.Users[0].TotalPageViewsInWindow.Should().Be(3);
        result.Value.Users[0].LastOpenedUtc.Should().NotBeNull();
        result.Value.Users[1].Email.Should().Be("inactive@example.com");
        result.Value.Users[1].UniqueUrlsInWindow.Should().Be(0);
        result.Value.Users[1].TotalPageViewsInWindow.Should().Be(0);
    }

    [Fact]
    public async Task HandleGetUsersAsync_AppliesActivityFilter()
    {
        Guid activeUserId = Guid.NewGuid();
        Guid inactiveUserId = Guid.NewGuid();

        await DbContext.Users.AddRangeAsync(
            new User
            {
                Id = activeUserId,
                Subject = "subject-active",
                Email = "active@example.com",
                Name = "Active User"
            },
            new User
            {
                Id = inactiveUserId,
                Subject = "subject-inactive",
                Email = "inactive@example.com",
                Name = "Inactive User"
            });

        await DbContext.PageViews.AddAsync(new PageView
        {
            Id = Guid.NewGuid(),
            UserId = activeUserId,
            IsAuthenticated = true,
            SessionId = "session-1",
            IpAddress = "203.0.113.10",
            Path = "/admin",
            QueryString = string.Empty,
            Url = "/admin",
            CreatedUtc = DateTime.UtcNow.AddDays(-1)
        });

        await DbContext.SaveChangesAsync();

        AdminUsersActivity.UsersQueryRequest request = new(ActivityFilter: "without-activity");

        Result<AdminUsersActivity.UsersResponse> result =
            await AdminUsersActivity.HandleGetUsersAsync(request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Users.Should().ContainSingle();
        result.Value.Users[0].Email.Should().Be("inactive@example.com");
    }

    [Fact]
    public async Task HandleGetUserActivityAsync_ReturnsGroupedUrlHistory()
    {
        Guid userId = Guid.NewGuid();
        User user = new()
        {
            Id = userId,
            Subject = "subject-1",
            Email = "reader@example.com",
            Name = "Reader",
            CreatedAt = DateTime.UtcNow.AddDays(-12),
            LastLogin = DateTime.UtcNow.AddDays(-1)
        };

        await DbContext.Users.AddAsync(user);
        await DbContext.PageViews.AddRangeAsync(
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                IsAuthenticated = true,
                SessionId = "session-1",
                IpAddress = "203.0.113.20",
                Path = "/categories/history",
                QueryString = string.Empty,
                Url = "/categories/history",
                CreatedUtc = DateTime.UtcNow.AddDays(-2)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                IsAuthenticated = true,
                SessionId = "session-1",
                IpAddress = "203.0.113.20",
                Path = "/categories/history",
                QueryString = string.Empty,
                Url = "/categories/history",
                CreatedUtc = DateTime.UtcNow.AddDays(-1)
            },
            new PageView
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                IsAuthenticated = true,
                SessionId = "session-2",
                IpAddress = "203.0.113.21",
                Path = "/collections",
                QueryString = "?tab=bookmarked",
                Url = "/collections?tab=bookmarked",
                CreatedUtc = DateTime.UtcNow.AddHours(-4)
            });

        await DbContext.SaveChangesAsync();

        AdminUsersActivity.UserActivityQueryRequest request = new(
            UserId: userId.ToString(),
            Days: 30,
            UrlContains: "categories",
            Page: 1,
            PageSize: 10);

        Result<AdminUsersActivity.UserActivityResponse> result =
            await AdminUsersActivity.HandleGetUserActivityAsync(request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value!.User.Email.Should().Be("reader@example.com");
        result.Value.Summary.TotalViews.Should().Be(2);
        result.Value.Summary.UniqueUrls.Should().Be(1);
        result.Value.UrlHistory.Should().ContainSingle();
        result.Value.UrlHistory[0].Url.Should().Be("/categories/history");
        result.Value.UrlHistory[0].OpenCount.Should().Be(2);
    }

    [Fact]
    public async Task HandleGetUserActivityAsync_InvalidUserId_ReturnsFailure()
    {
        AdminUsersActivity.UserActivityQueryRequest request = new(
            UserId: "not-a-guid",
            Days: 30);

        Result<AdminUsersActivity.UserActivityResponse> result =
            await AdminUsersActivity.HandleGetUserActivityAsync(request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
    }
}
