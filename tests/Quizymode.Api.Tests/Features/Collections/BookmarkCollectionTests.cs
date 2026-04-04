using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class BookmarkCollectionTests : DatabaseTestFixture
{
    private async Task<Collection> CreateCollectionAsync(string userId)
    {
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Test",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(col);
        await DbContext.SaveChangesAsync();
        return col;
    }

    private Mock<IUserContext> UserContext(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_AddsBookmark_WhenCollectionExists()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync("owner");

        var result = await BookmarkCollection.HandleAsync(col.Id, DbContext, UserContext(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.CollectionBookmarks.Should().ContainSingle(b => b.CollectionId == col.Id && b.UserId == userId);
    }

    [Fact]
    public async Task HandleAsync_IsIdempotent_WhenAlreadyBookmarked()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync("owner");

        await BookmarkCollection.HandleAsync(col.Id, DbContext, UserContext(userId).Object, CancellationToken.None);
        var result = await BookmarkCollection.HandleAsync(col.Id, DbContext, UserContext(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.CollectionBookmarks.Should().ContainSingle(b => b.CollectionId == col.Id && b.UserId == userId);
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenCollectionDoesNotExist()
    {
        var result = await BookmarkCollection.HandleAsync(
            Guid.NewGuid(),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}

public sealed class UnbookmarkCollectionTests : DatabaseTestFixture
{
    private async Task<Collection> CreateCollectionAsync(string userId)
    {
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Test",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(col);
        await DbContext.SaveChangesAsync();
        return col;
    }

    private Mock<IUserContext> UserContext(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_RemovesBookmark_WhenExists()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync("owner");

        DbContext.CollectionBookmarks.Add(new CollectionBookmark
        {
            Id = Guid.NewGuid(),
            CollectionId = col.Id,
            UserId = userId,
            CreatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await UnbookmarkCollection.HandleAsync(col.Id, DbContext, UserContext(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.CollectionBookmarks.Should().NotContain(b => b.CollectionId == col.Id && b.UserId == userId);
    }

    [Fact]
    public async Task HandleAsync_Succeeds_WhenNoBookmarkExists()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync("owner");

        var result = await UnbookmarkCollection.HandleAsync(col.Id, DbContext, UserContext(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }
}
