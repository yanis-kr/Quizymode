using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class AuditServiceTests : DatabaseTestFixture
{
    private readonly Mock<IHttpContextAccessor> _httpContextAccessorMock;
    private readonly AuditService _auditService;

    public AuditServiceTests()
    {
        _httpContextAccessorMock = new Mock<IHttpContextAccessor>();
        _auditService = new AuditService(DbContext, _httpContextAccessorMock.Object, NullLogger<AuditService>.Instance);
    }

    [Fact]
    public async Task LogAsync_WithUserId_CreatesAuditEntry()
    {
        // Arrange
        Guid userId = Guid.NewGuid();
        Guid entityId = Guid.NewGuid();
        SetupHttpContext("192.168.1.1");

        // Act
        await _auditService.LogAsync(
            AuditAction.ItemCreated,
            userId: userId,
            entityId: entityId,
            cancellationToken: CancellationToken.None);

        // Assert
        Audit? audit = await DbContext.Audits.FirstOrDefaultAsync();
        audit.Should().NotBeNull();
        audit!.UserId.Should().Be(userId);
        audit.Action.Should().Be(AuditAction.ItemCreated);
        audit.EntityId.Should().Be(entityId);
        audit.IpAddress.Should().Be("192.168.1.1");
        audit.CreatedUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task LogAsync_WithoutUserId_CreatesAuditEntryWithNullUserId()
    {
        // Arrange
        SetupHttpContext("10.0.0.1");

        // Act
        await _auditService.LogAsync(
            AuditAction.LoginFailed,
            cancellationToken: CancellationToken.None);

        // Assert
        Audit? audit = await DbContext.Audits.FirstOrDefaultAsync();
        audit.Should().NotBeNull();
        audit!.UserId.Should().BeNull();
        audit.Action.Should().Be(AuditAction.LoginFailed);
        audit.EntityId.Should().BeNull();
        audit.IpAddress.Should().Be("10.0.0.1");
    }

    [Fact]
    public async Task LogAsync_WithMetadata_CreatesAuditEntryWithMetadata()
    {
        // Arrange
        Guid userId = Guid.NewGuid();
        Dictionary<string, string> metadata = new()
        {
            { "key1", "value1" },
            { "key2", "value2" }
        };
        SetupHttpContext("172.16.0.1");

        // Act
        await _auditService.LogAsync(
            AuditAction.CommentCreated,
            userId: userId,
            metadata: metadata,
            cancellationToken: CancellationToken.None);

        // Assert
        Audit? audit = await DbContext.Audits.FirstOrDefaultAsync();
        audit.Should().NotBeNull();
        audit!.Metadata.Should().HaveCount(2);
        audit.Metadata["key1"].Should().Be("value1");
        audit.Metadata["key2"].Should().Be("value2");
    }

    [Fact]
    public async Task LogAsync_WithXForwardedForHeader_UsesForwardedIp()
    {
        // Arrange
        Guid userId = Guid.NewGuid();
        SetupHttpContextWithHeaders("203.0.113.1", "192.168.1.1", null);

        // Act
        await _auditService.LogAsync(
            AuditAction.LoginSuccess,
            userId: userId,
            cancellationToken: CancellationToken.None);

        // Assert
        Audit? audit = await DbContext.Audits.FirstOrDefaultAsync();
        audit.Should().NotBeNull();
        audit!.IpAddress.Should().Be("203.0.113.1"); // Should use X-Forwarded-For (first IP)
    }

    [Fact]
    public async Task LogAsync_WithXRealIpHeader_UsesRealIp()
    {
        // Arrange
        Guid userId = Guid.NewGuid();
        SetupHttpContextWithHeaders(null, null, "198.51.100.1");

        // Act
        await _auditService.LogAsync(
            AuditAction.LoginSuccess,
            userId: userId,
            cancellationToken: CancellationToken.None);

        // Assert
        Audit? audit = await DbContext.Audits.FirstOrDefaultAsync();
        audit.Should().NotBeNull();
        audit!.IpAddress.Should().Be("198.51.100.1");
    }

    [Fact]
    public async Task LogAsync_WithMultipleXForwardedFor_UsesFirstIp()
    {
        // Arrange
        Guid userId = Guid.NewGuid();
        SetupHttpContextWithHeaders("203.0.113.1, 198.51.100.1, 192.168.1.1", null, null);

        // Act
        await _auditService.LogAsync(
            AuditAction.LoginSuccess,
            userId: userId,
            cancellationToken: CancellationToken.None);

        // Assert
        Audit? audit = await DbContext.Audits.FirstOrDefaultAsync();
        audit.Should().NotBeNull();
        audit!.IpAddress.Should().Be("203.0.113.1"); // Should use first IP from comma-separated list
    }

    [Fact]
    public async Task LogAsync_NoHttpContext_UsesUnknownIp()
    {
        // Arrange
        Guid userId = Guid.NewGuid();
        _httpContextAccessorMock.Setup(x => x.HttpContext).Returns((HttpContext?)null);

        // Act
        await _auditService.LogAsync(
            AuditAction.ItemCreated,
            userId: userId,
            cancellationToken: CancellationToken.None);

        // Assert
        Audit? audit = await DbContext.Audits.FirstOrDefaultAsync();
        audit.Should().NotBeNull();
        audit!.IpAddress.Should().Be("unknown");
    }

    [Fact]
    public async Task LogAsync_AllActions_CanBeLogged()
    {
        // Arrange
        Guid userId = Guid.NewGuid();
        SetupHttpContext("127.0.0.1");

        // Act & Assert - Test all audit actions
        await _auditService.LogAsync(AuditAction.UserCreated, userId: userId);
        await _auditService.LogAsync(AuditAction.LoginSuccess, userId: userId);
        await _auditService.LogAsync(AuditAction.LoginFailed);
        await _auditService.LogAsync(AuditAction.CommentCreated, userId: userId);
        await _auditService.LogAsync(AuditAction.CommentDeleted, userId: userId);
        await _auditService.LogAsync(AuditAction.ItemCreated, userId: userId);
        await _auditService.LogAsync(AuditAction.ItemUpdated, userId: userId);
        await _auditService.LogAsync(AuditAction.ItemDeleted, userId: userId);

        List<Audit> audits = await DbContext.Audits.ToListAsync();
        audits.Should().HaveCount(8);
        audits.Select(a => a.Action).Should().Contain(AuditAction.UserCreated);
        audits.Select(a => a.Action).Should().Contain(AuditAction.LoginSuccess);
        audits.Select(a => a.Action).Should().Contain(AuditAction.LoginFailed);
        audits.Select(a => a.Action).Should().Contain(AuditAction.CommentCreated);
        audits.Select(a => a.Action).Should().Contain(AuditAction.CommentDeleted);
        audits.Select(a => a.Action).Should().Contain(AuditAction.ItemCreated);
        audits.Select(a => a.Action).Should().Contain(AuditAction.ItemUpdated);
        audits.Select(a => a.Action).Should().Contain(AuditAction.ItemDeleted);
    }

    [Fact]
    public async Task LogAsync_DatabaseError_DoesNotThrow()
    {
        // Arrange - Create a separate disposed context to test error handling
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;
        ApplicationDbContext disposedContext = new ApplicationDbContext(options);
        disposedContext.Dispose(); // Dispose to cause database error
        
        AuditService auditServiceWithDisposedContext = new AuditService(
            disposedContext, 
            _httpContextAccessorMock.Object, 
            NullLogger<AuditService>.Instance);
        
        Guid userId = Guid.NewGuid();
        SetupHttpContext("127.0.0.1");

        // Act
        Func<Task> act = async () => await auditServiceWithDisposedContext.LogAsync(
            AuditAction.ItemCreated,
            userId: userId,
            cancellationToken: CancellationToken.None);

        // Assert - Should not throw, errors are logged but don't fail the request
        await act.Should().NotThrowAsync();
    }

    private void SetupHttpContext(string ipAddress)
    {
        Mock<HttpContext> httpContextMock = new();
        Mock<ConnectionInfo> connectionInfoMock = new();
        System.Net.IPAddress? ip = System.Net.IPAddress.Parse(ipAddress);
        connectionInfoMock.Setup(x => x.RemoteIpAddress).Returns(ip);
        httpContextMock.Setup(x => x.Connection).Returns(connectionInfoMock.Object);
        httpContextMock.Setup(x => x.Request.Headers).Returns(new Mock<IHeaderDictionary>().Object);
        _httpContextAccessorMock.Setup(x => x.HttpContext).Returns(httpContextMock.Object);
    }

    private void SetupHttpContextWithHeaders(string? xForwardedFor, string? xRealIp, string? remoteIp)
    {
        Mock<HttpContext> httpContextMock = new();
        Mock<ConnectionInfo> connectionInfoMock = new();
        Mock<IHeaderDictionary> headersMock = new();

        if (!string.IsNullOrEmpty(remoteIp))
        {
            System.Net.IPAddress? ip = System.Net.IPAddress.Parse(remoteIp);
            connectionInfoMock.Setup(x => x.RemoteIpAddress).Returns(ip);
        }

        if (!string.IsNullOrEmpty(xForwardedFor))
        {
            headersMock.Setup(x => x["X-Forwarded-For"]).Returns(new Microsoft.Extensions.Primitives.StringValues(xForwardedFor));
        }

        if (!string.IsNullOrEmpty(xRealIp))
        {
            headersMock.Setup(x => x["X-Real-IP"]).Returns(new Microsoft.Extensions.Primitives.StringValues(xRealIp));
        }

        Mock<HttpRequest> requestMock = new();
        requestMock.Setup(x => x.Headers).Returns(headersMock.Object);
        httpContextMock.Setup(x => x.Request).Returns(requestMock.Object);
        httpContextMock.Setup(x => x.Connection).Returns(connectionInfoMock.Object);
        _httpContextAccessorMock.Setup(x => x.HttpContext).Returns(httpContextMock.Object);
    }

}

