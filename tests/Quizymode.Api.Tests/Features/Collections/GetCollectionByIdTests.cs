using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class GetCollectionByIdTests : DatabaseTestFixture
{
    private Collection AddCollection(string createdBy, bool isPublic = false)
    {
        Collection c = new()
        {
            Id = Guid.NewGuid(),
            Name = "Test Collection",
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsPublic = isPublic
        };
        DbContext.Collections.Add(c);
        DbContext.SaveChanges();
        return c;
    }

    [Fact]
    public async Task HandleAsync_ReturnsCollection_WhenOwnerAccesses()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = AddCollection(userId);

        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId);

        var result = await GetCollectionById.HandleAsync(col.Id, DbContext, ctx.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Id.Should().Be(col.Id.ToString());
        result.Value.Name.Should().Be("Test Collection");
    }

    [Fact]
    public async Task HandleAsync_ReturnsCollection_WhenPublicAndUnauthenticated()
    {
        Collection col = AddCollection("some-user", isPublic: true);

        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(false);

        var result = await GetCollectionById.HandleAsync(col.Id, DbContext, ctx.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenPrivateAndNotOwner()
    {
        string ownerId = Guid.NewGuid().ToString();
        string otherId = Guid.NewGuid().ToString();
        Collection col = AddCollection(ownerId, isPublic: false);

        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(otherId);

        var result = await GetCollectionById.HandleAsync(col.Id, DbContext, ctx.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenCollectionDoesNotExist()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(Guid.NewGuid().ToString());

        var result = await GetCollectionById.HandleAsync(Guid.NewGuid(), DbContext, ctx.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Collection.NotFound");
    }

    [Fact]
    public async Task HandleAsync_IncludesItemCount()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = AddCollection(userId);

        // Add two collection items
        DbContext.CollectionItems.AddRange(
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = col.Id, ItemId = Guid.NewGuid(), AddedAt = DateTime.UtcNow },
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = col.Id, ItemId = Guid.NewGuid(), AddedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId);

        var result = await GetCollectionById.HandleAsync(col.Id, DbContext, ctx.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ItemCount.Should().Be(2);
    }

    [Fact]
    public async Task CanAccessCollectionAsync_ReturnsTrueForPublicCollection()
    {
        Collection col = new() { Id = Guid.NewGuid(), Name = "Public", CreatedBy = "u1", IsPublic = true };
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(false);

        bool canAccess = await GetCollectionById.CanAccessCollectionAsync(DbContext, col, ctx.Object, CancellationToken.None);
        canAccess.Should().BeTrue();
    }

    [Fact]
    public async Task CanAccessCollectionAsync_ReturnsTrueForOwner()
    {
        string userId = "owner-id";
        Collection col = new() { Id = Guid.NewGuid(), Name = "Private", CreatedBy = userId, IsPublic = false };
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId);

        bool canAccess = await GetCollectionById.CanAccessCollectionAsync(DbContext, col, ctx.Object, CancellationToken.None);
        canAccess.Should().BeTrue();
    }

    [Fact]
    public async Task CanAccessCollectionAsync_ReturnsFalseForUnauthenticatedOnPrivate()
    {
        Collection col = new() { Id = Guid.NewGuid(), Name = "Private", CreatedBy = "owner", IsPublic = false };
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(false);
        ctx.SetupGet(x => x.UserId).Returns((string?)null);

        bool canAccess = await GetCollectionById.CanAccessCollectionAsync(DbContext, col, ctx.Object, CancellationToken.None);
        canAccess.Should().BeFalse();
    }
}
