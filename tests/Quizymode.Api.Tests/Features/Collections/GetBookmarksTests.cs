using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class GetBookmarksTests : DatabaseTestFixture
{
    private Mock<IUserContext> UserContext(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        return ctx;
    }

    private Item AddItem(string createdBy)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = $"Q-{Guid.NewGuid():N}",
            CorrectAnswer = "A",
            FuzzySignature = Guid.NewGuid().ToString("N"),
            FuzzyBucket = 1,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Items.Add(item);
        return item;
    }

    [Fact]
    public async Task HandleAsync_ReturnsEmptyList_WhenNoBookmarks()
    {
        var result = await GetBookmarks.HandleAsync(
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Collections.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_ReturnsBookmarkedCollections()
    {
        string userId = Guid.NewGuid().ToString();

        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Bookmarked Collection",
            CreatedBy = "owner",
            CreatedAt = DateTime.UtcNow,
            IsPublic = true
        };
        DbContext.Collections.Add(col);

        DbContext.CollectionBookmarks.Add(new CollectionBookmark
        {
            Id = Guid.NewGuid(),
            CollectionId = col.Id,
            UserId = userId,
            CreatedAt = DateTime.UtcNow
        });

        await DbContext.SaveChangesAsync();

        var result = await GetBookmarks.HandleAsync(
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Collections.Should().ContainSingle(c => c.Id == col.Id.ToString());
        result.Value.Collections[0].Name.Should().Be("Bookmarked Collection");
    }

    [Fact]
    public async Task HandleAsync_IncludesItemCount_ForBookmarkedCollections()
    {
        string userId = Guid.NewGuid().ToString();

        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Col With Items",
            CreatedBy = "owner",
            CreatedAt = DateTime.UtcNow,
            IsPublic = true
        };
        DbContext.Collections.Add(col);

        DbContext.CollectionBookmarks.Add(new CollectionBookmark
        {
            Id = Guid.NewGuid(),
            CollectionId = col.Id,
            UserId = userId,
            CreatedAt = DateTime.UtcNow
        });

        // Three real questions. A membership row with no item row is an orphan and is not counted (#554).
        Item[] questions = [AddItem(userId), AddItem(userId), AddItem(userId)];
        DbContext.CollectionItems.AddRange(
            questions.Select(q => new CollectionItem { Id = Guid.NewGuid(), CollectionId = col.Id, ItemId = q.Id, AddedAt = DateTime.UtcNow }));

        await DbContext.SaveChangesAsync();

        var result = await GetBookmarks.HandleAsync(
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Collections[0].ItemCount.Should().Be(3);
    }

    [Fact]
    public async Task HandleAsync_DoesNotReturnOtherUsersBookmarks()
    {
        string userA = Guid.NewGuid().ToString();
        string userB = Guid.NewGuid().ToString();

        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "A's Collection",
            CreatedBy = "owner",
            CreatedAt = DateTime.UtcNow,
            IsPublic = true
        };
        DbContext.Collections.Add(col);

        DbContext.CollectionBookmarks.Add(new CollectionBookmark
        {
            Id = Guid.NewGuid(),
            CollectionId = col.Id,
            UserId = userA,
            CreatedAt = DateTime.UtcNow
        });

        await DbContext.SaveChangesAsync();

        var result = await GetBookmarks.HandleAsync(
            DbContext,
            UserContext(userB).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Collections.Should().BeEmpty();
    }
}
