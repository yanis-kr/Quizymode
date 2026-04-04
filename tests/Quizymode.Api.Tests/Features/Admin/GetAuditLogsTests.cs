using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetAuditLogsTests : DatabaseTestFixture
{
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
        var result = await GetAuditLogs.HandleAsync(request, DbContext, CancellationToken.None);

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
        var result = await GetAuditLogs.HandleAsync(request, DbContext, CancellationToken.None);

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
        var result = await GetAuditLogs.HandleAsync(request, DbContext, CancellationToken.None);

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
        var result = await GetAuditLogs.HandleAsync(request, DbContext, CancellationToken.None);

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
        var result = await GetAuditLogs.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Logs.Should().ContainSingle(l => l.UserEmail == "test@example.com");
    }

    [Fact]
    public async Task HandleAsync_UserEmailIsNull_WhenNoUserId()
    {
        DbContext.Audits.Add(BuildAudit(AuditAction.LoginFailed, userId: null));
        await DbContext.SaveChangesAsync();

        var request = new GetAuditLogs.QueryRequest();
        var result = await GetAuditLogs.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Logs.Single().UserEmail.Should().BeNull();
    }
}
