using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetAuditLogsTests : DatabaseTestFixture
{
    private static IIpGeolocationService NullGeoService()
    {
        var mock = new Mock<IIpGeolocationService>();
        mock.Setup(g => g.GetCountryAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        return mock.Object;
    }

    private static AuditLogsOptions EmptyOptions() => new();

    private static AuditLogsOptions OptionsWithExclusions(params string[] emails) =>
        new() { ExcludedEmails = [.. emails] };

    private Audit BuildAudit(AuditAction action, Guid? userId = null) => new()
    {
        Id = Guid.NewGuid(),
        Action = action,
        IpAddress = "127.0.0.1",
        UserId = userId,
        CreatedUtc = DateTime.UtcNow
    };

    [Fact]
    public async Task HandleAsync_NoLogs_ReturnsEmpty()
    {
        var request = new GetAuditLogs.QueryRequest();
        var result = await GetAuditLogs.HandleAsync(request, EmptyOptions(), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Logs.Should().BeEmpty();
        result.Value.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_ReturnsAllLogs_WhenNoFilter()
    {
        DbContext.Audits.AddRange(
            BuildAudit(AuditAction.ItemCreated),
            BuildAudit(AuditAction.ItemDeleted),
            BuildAudit(AuditAction.Logout));
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest();
        var result = await GetAuditLogs.HandleAsync(request, EmptyOptions(), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.TotalCount.Should().Be(3);
        result.Value.Logs.Should().HaveCount(3);
    }

    [Fact]
    public async Task HandleAsync_FiltersByActionType()
    {
        DbContext.Audits.AddRange(
            BuildAudit(AuditAction.ItemCreated),
            BuildAudit(AuditAction.ItemDeleted),
            BuildAudit(AuditAction.Logout));
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest(new List<AuditAction> { AuditAction.ItemCreated });
        var result = await GetAuditLogs.HandleAsync(request, EmptyOptions(), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.TotalCount.Should().Be(1);
        result.Value.Logs.Should().ContainSingle(l => l.Action == "ItemCreated");
    }

    [Fact]
    public async Task HandleAsync_Pagination_ReturnsCorrectPage()
    {
        for (int i = 0; i < 5; i++)
        {
            DbContext.Audits.Add(BuildAudit(AuditAction.ItemCreated));
        }
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest(Page: 2, PageSize: 2);
        var result = await GetAuditLogs.HandleAsync(request, EmptyOptions(), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Logs.Should().HaveCount(2);
        result.Value.TotalCount.Should().Be(5);
        result.Value.TotalPages.Should().Be(3);
        result.Value.Page.Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_IncludesUserEmail_WhenUserFound()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub", Email = "test@example.com" };
        DbContext.Users.Add(user);
        DbContext.Audits.Add(BuildAudit(AuditAction.Logout, userId: user.Id));
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest();
        var result = await GetAuditLogs.HandleAsync(request, EmptyOptions(), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Logs.Should().ContainSingle(l => l.UserEmail == "test@example.com");
    }

    [Fact]
    public async Task HandleAsync_UserEmailIsNull_WhenNoUserId()
    {
        DbContext.Audits.Add(BuildAudit(AuditAction.LoginFailed, userId: null));
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest();
        var result = await GetAuditLogs.HandleAsync(request, EmptyOptions(), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Logs.Single().UserEmail.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ExcludesConfiguredEmails()
    {
        User excluded = new() { Id = Guid.NewGuid(), Subject = "sub-excl", Email = "test-user@quizymode.com" };
        User included = new() { Id = Guid.NewGuid(), Subject = "sub-incl", Email = "real@example.com" };
        DbContext.Users.AddRange(excluded, included);
        DbContext.Audits.AddRange(
            BuildAudit(AuditAction.LoginSuccess, userId: excluded.Id),
            BuildAudit(AuditAction.LoginSuccess, userId: included.Id));
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest();
        var result = await GetAuditLogs.HandleAsync(
            request,
            OptionsWithExclusions("test-user@quizymode.com"),
            DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.TotalCount.Should().Be(1);
        result.Value.Logs.Should().ContainSingle(l => l.UserEmail == "real@example.com");
    }

    [Fact]
    public async Task HandleAsync_AnonymousLogsNotExcluded_WhenExclusionConfigured()
    {
        User excluded = new() { Id = Guid.NewGuid(), Subject = "sub-excl", Email = "test-user@quizymode.com" };
        DbContext.Users.Add(excluded);
        DbContext.Audits.AddRange(
            BuildAudit(AuditAction.LoginFailed, userId: excluded.Id),
            BuildAudit(AuditAction.LoginFailed, userId: null)); // anonymous
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest();
        var result = await GetAuditLogs.HandleAsync(
            request,
            OptionsWithExclusions("test-user@quizymode.com"),
            DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.TotalCount.Should().Be(1);
        result.Value.Logs.Single().UserEmail.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_FiltersByUserEmail_ReturnsOnlyThatUser()
    {
        User userA = new() { Id = Guid.NewGuid(), Subject = "sub-a", Email = "alice@example.com" };
        User userB = new() { Id = Guid.NewGuid(), Subject = "sub-b", Email = "bob@example.com" };
        DbContext.Users.AddRange(userA, userB);
        DbContext.Audits.AddRange(
            BuildAudit(AuditAction.LoginSuccess, userId: userA.Id),
            BuildAudit(AuditAction.ItemCreated, userId: userB.Id));
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest(UserEmail: "alice@example.com");
        var result = await GetAuditLogs.HandleAsync(request, EmptyOptions(), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.TotalCount.Should().Be(1);
        result.Value.Logs.Should().ContainSingle(l => l.UserEmail == "alice@example.com");
    }

    [Fact]
    public async Task HandleAsync_FiltersByUserEmail_ReturnsEmpty_WhenEmailNotFound()
    {
        DbContext.Audits.Add(BuildAudit(AuditAction.ItemCreated));
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest(UserEmail: "nobody@example.com");
        var result = await GetAuditLogs.HandleAsync(request, EmptyOptions(), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.TotalCount.Should().Be(0);
        result.Value.Logs.Should().BeEmpty();
    }
}
