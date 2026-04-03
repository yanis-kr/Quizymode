using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class CollectionItemsTests : DatabaseTestFixture
{
    private async Task<Collection> CreateCollectionAsync(string userId)
    {
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Test Collection",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(col);
        await DbContext.SaveChangesAsync();
        return col;
    }

    private async Task<Item> CreateItemAsync()
    {
        Category cat = new()
        {
            Id = Guid.NewGuid(),
            Name = $"cat-{Guid.NewGuid()}",
            IsPrivate = false,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Categories.Add(cat);

        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = "Q?",
            CorrectAnswer = "A",
            FuzzySignature = "abc",
            FuzzyBucket = 1,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow,
            CategoryId = cat.Id
        };
        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();
        return item;
    }

    private Mock<IUserContext> UserContext(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        return ctx;
    }

    // --- HandleAddAsync ---

    [Fact]
    public async Task HandleAddAsync_AddsItem_WhenOwnerAndItemExists()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);
        Item item = await CreateItemAsync();

        var result = await CollectionItems.HandleAddAsync(
            col.Id,
            new CollectionItems.AddRequest(item.Id),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.CollectionId.Should().Be(col.Id);
        result.Value.ItemId.Should().Be(item.Id);
        DbContext.CollectionItems.Should().ContainSingle(ci => ci.CollectionId == col.Id && ci.ItemId == item.Id);
    }

    [Fact]
    public async Task HandleAddAsync_IsIdempotent_WhenItemAlreadyInCollection()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);
        Item item = await CreateItemAsync();

        await CollectionItems.HandleAddAsync(col.Id, new CollectionItems.AddRequest(item.Id), DbContext, UserContext(userId).Object, CancellationToken.None);
        var result = await CollectionItems.HandleAddAsync(col.Id, new CollectionItems.AddRequest(item.Id), DbContext, UserContext(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.CollectionItems.Should().ContainSingle(ci => ci.CollectionId == col.Id && ci.ItemId == item.Id);
    }

    [Fact]
    public async Task HandleAddAsync_ReturnsNotFound_WhenCollectionDoesNotExist()
    {
        var result = await CollectionItems.HandleAddAsync(
            Guid.NewGuid(),
            new CollectionItems.AddRequest(Guid.NewGuid()),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Collection.NotFound");
    }

    [Fact]
    public async Task HandleAddAsync_ReturnsValidation_WhenNotOwner()
    {
        Collection col = await CreateCollectionAsync(Guid.NewGuid().ToString());
        Item item = await CreateItemAsync();

        var result = await CollectionItems.HandleAddAsync(
            col.Id,
            new CollectionItems.AddRequest(item.Id),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("CollectionItems.Forbidden");
    }

    [Fact]
    public async Task HandleAddAsync_ReturnsNotFound_WhenItemDoesNotExist()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);

        var result = await CollectionItems.HandleAddAsync(
            col.Id,
            new CollectionItems.AddRequest(Guid.NewGuid()),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Item.NotFound");
    }

    // --- HandleBulkAddAsync ---

    [Fact]
    public async Task HandleBulkAddAsync_AddsMultipleItems()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);
        Item item1 = await CreateItemAsync();
        Item item2 = await CreateItemAsync();

        var result = await CollectionItems.HandleBulkAddAsync(
            col.Id,
            new CollectionItems.BulkAddRequest([item1.Id, item2.Id]),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.AddedCount.Should().Be(2);
        result.Value.SkippedCount.Should().Be(0);
    }

    [Fact]
    public async Task HandleBulkAddAsync_SkipsNonExistentItems()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);
        Item item = await CreateItemAsync();

        var result = await CollectionItems.HandleBulkAddAsync(
            col.Id,
            new CollectionItems.BulkAddRequest([item.Id, Guid.NewGuid()]),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.AddedCount.Should().Be(1);
        result.Value.SkippedCount.Should().Be(1);
    }

    [Fact]
    public async Task HandleBulkAddAsync_SkipsAlreadyAddedItems()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);
        Item item = await CreateItemAsync();

        DbContext.CollectionItems.Add(new CollectionItem
        {
            Id = Guid.NewGuid(),
            CollectionId = col.Id,
            ItemId = item.Id,
            AddedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await CollectionItems.HandleBulkAddAsync(
            col.Id,
            new CollectionItems.BulkAddRequest([item.Id]),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.AddedCount.Should().Be(0);
        result.Value.SkippedCount.Should().Be(1);
    }

    [Fact]
    public async Task HandleBulkAddAsync_ReturnsNotFound_WhenCollectionDoesNotExist()
    {
        var result = await CollectionItems.HandleBulkAddAsync(
            Guid.NewGuid(),
            new CollectionItems.BulkAddRequest([Guid.NewGuid()]),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Collection.NotFound");
    }

    // --- HandleRemoveAsync ---

    [Fact]
    public async Task HandleRemoveAsync_RemovesItem_WhenOwner()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);
        Guid itemId = Guid.NewGuid();

        DbContext.CollectionItems.Add(new CollectionItem
        {
            Id = Guid.NewGuid(),
            CollectionId = col.Id,
            ItemId = itemId,
            AddedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await CollectionItems.HandleRemoveAsync(col.Id, itemId, DbContext, UserContext(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.CollectionItems.Should().NotContain(ci => ci.CollectionId == col.Id && ci.ItemId == itemId);
    }

    [Fact]
    public async Task HandleRemoveAsync_ReturnsNotFound_WhenItemNotInCollection()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);

        var result = await CollectionItems.HandleRemoveAsync(col.Id, Guid.NewGuid(), DbContext, UserContext(userId).Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("CollectionItems.NotFound");
    }

    [Fact]
    public async Task HandleRemoveAsync_ReturnsNotFound_WhenCollectionDoesNotExist()
    {
        var result = await CollectionItems.HandleRemoveAsync(
            Guid.NewGuid(),
            Guid.NewGuid(),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Collection.NotFound");
    }
}
