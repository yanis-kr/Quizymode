using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class GetCollectionBookmarksTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_CollectionNotFound_ReturnsNotFound()
    {
        var result = await GetCollectionBookmarks.HandleAsync(
            Guid.NewGuid(), DbContext, AuthenticatedUser("user-1").Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Collection.NotFound");
    }

    [Theory]
    [InlineData(false, "Collection.NotFound")]
    [InlineData(true, "Collection.Forbidden")]
    public async Task HandleAsync_NonOwner_ReturnsNotFoundForPrivate_ForbiddenForPublic(bool isPublic, string code)
    {
        string ownerId = Guid.NewGuid().ToString();
        string nonOwnerId = Guid.NewGuid().ToString();

        Collection collection = new() { Id = Guid.NewGuid(), Name = "My Col", CreatedBy = ownerId, CreatedAt = DateTime.UtcNow, IsPublic = isPublic };
        DbContext.Collections.Add(collection);
        await DbContext.SaveChangesAsync();

        var result = await GetCollectionBookmarks.HandleAsync(
            collection.Id, DbContext, AuthenticatedUser(nonOwnerId).Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be(code);
    }

    [Theory]
    [InlineData(null, false, "Collection.NotFound")]
    [InlineData("", false, "Collection.NotFound")]
    [InlineData(null, true, "Collection.Forbidden")]
    [InlineData("", true, "Collection.Forbidden")]
    public async Task HandleAsync_NullOrEmptyUserId_IsNonOwner(string? userId, bool isPublic, string code)
    {
        Collection collection = new() { Id = Guid.NewGuid(), Name = "My Col", CreatedBy = string.Empty, CreatedAt = DateTime.UtcNow, IsPublic = isPublic };
        DbContext.Collections.Add(collection);
        await DbContext.SaveChangesAsync();
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);

        var result = await GetCollectionBookmarks.HandleAsync(collection.Id, DbContext, ctx.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be(code);
    }

    [Fact]
    public async Task HandleAsync_OwnerWithNoBookmarks_ReturnsEmptyList()
    {
        string ownerId = Guid.NewGuid().ToString();
        Collection collection = new() { Id = Guid.NewGuid(), Name = "My Col", CreatedBy = ownerId, CreatedAt = DateTime.UtcNow };
        DbContext.Collections.Add(collection);
        await DbContext.SaveChangesAsync();

        var result = await GetCollectionBookmarks.HandleAsync(
            collection.Id, DbContext, AuthenticatedUser(ownerId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.BookmarkedBy.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_OwnerWithBookmarks_ReturnsBookmarkers()
    {
        string ownerId = Guid.NewGuid().ToString();
        Guid bookmarkerId = Guid.NewGuid();

        User bookmarker = new() { Id = bookmarkerId, Subject = "sub-bm", Name = "Bookmarker", Email = "bm@example.com" };
        Collection collection = new() { Id = Guid.NewGuid(), Name = "My Col", CreatedBy = ownerId, CreatedAt = DateTime.UtcNow };
        CollectionBookmark bookmark = new()
        {
            Id = Guid.NewGuid(),
            CollectionId = collection.Id,
            UserId = bookmarkerId.ToString(),
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Users.Add(bookmarker);
        DbContext.Collections.Add(collection);
        DbContext.CollectionBookmarks.Add(bookmark);
        await DbContext.SaveChangesAsync();

        var result = await GetCollectionBookmarks.HandleAsync(
            collection.Id, DbContext, AuthenticatedUser(ownerId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.BookmarkedBy.Should().ContainSingle();
        result.Value.BookmarkedBy[0].UserId.Should().Be(bookmarkerId.ToString());
        result.Value.BookmarkedBy[0].Name.Should().Be("Bookmarker");
    }

    [Fact]
    public async Task HandleAsync_BookmarkerNotInUsersTable_ReturnsNullName()
    {
        string ownerId = Guid.NewGuid().ToString();
        string unknownUserId = Guid.NewGuid().ToString();

        Collection collection = new() { Id = Guid.NewGuid(), Name = "My Col", CreatedBy = ownerId, CreatedAt = DateTime.UtcNow };
        CollectionBookmark bookmark = new()
        {
            Id = Guid.NewGuid(),
            CollectionId = collection.Id,
            UserId = unknownUserId,
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(collection);
        DbContext.CollectionBookmarks.Add(bookmark);
        await DbContext.SaveChangesAsync();

        var result = await GetCollectionBookmarks.HandleAsync(
            collection.Id, DbContext, AuthenticatedUser(ownerId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.BookmarkedBy.Should().ContainSingle();
        result.Value.BookmarkedBy[0].Name.Should().BeNull();
    }
}
