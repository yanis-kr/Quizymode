using FluentAssertions;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using GetItemsHandler = Quizymode.Api.Features.Items.Get.GetItemsHandler;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>
/// #589 (AC 1.5.1, I3, AC 1.16.7, AC 1.16b.1): in a collection read, a private item is listed only when its creator owns the
/// collection. The owner still sees and counts their own private items, and a card's itemCount equals the roster total.
/// </summary>
public sealed class CollectionPrivateItemVisibilityTests : DatabaseTestFixture
{
    private const string Owner = "owner-user";
    private const string Visitor = "visitor-user";
    private const string Stranger = "stranger-user";

    private Collection NewPublicCollection()
    {
        Collection collection = new() { Id = Guid.NewGuid(), Name = $"c-{Guid.NewGuid():N}", CreatedBy = Owner, CreatedAt = DateTime.UtcNow, IsPublic = true };
        DbContext.Collections.Add(collection);
        return collection;
    }

    private Item AddItem(Collection collection, string createdBy, bool isPrivate)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = $"Q-{Guid.NewGuid():N}",
            CorrectAnswer = "A",
            FuzzySignature = Guid.NewGuid().ToString("N"),
            FuzzyBucket = 1,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsPrivate = isPrivate
        };
        DbContext.Items.Add(item);
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item.Id, AddedAt = DateTime.UtcNow });
        return item;
    }

    private async Task<GetItems.Response> RosterAsync(Collection root, string viewer)
    {
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(
            new GetItems.QueryRequest(Category: null, IsPrivate: null, Keywords: null, CollectionId: root.Id, IsRandom: null, Page: 1, PageSize: 50),
            DbContext,
            FakeUserContext.User(viewer),
            CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        return result.Value;
    }

    private async Task<int> CardCountAsync(Collection root, string viewer) =>
        (await CollectionCardCounts.ForCollectionsAsync(DbContext, [root.Id], viewer, CancellationToken.None))[root.Id].ItemCount;

    [Fact]
    public async Task Visitor_SeesOwnersPrivateItem_NotAnotherUsersPrivateItem_AndCountMatches()
    {
        Collection root = NewPublicCollection();
        Item shared = AddItem(root, Owner, isPrivate: false);
        Item ownerPrivate = AddItem(root, Owner, isPrivate: true);
        Item strangerPrivate = AddItem(root, Stranger, isPrivate: true);
        await DbContext.SaveChangesAsync();

        GetItems.Response visitor = await RosterAsync(root, Visitor);
        List<string> visitorIds = visitor.Items.Select(i => i.Id).ToList();

        visitorIds.Should().Contain(shared.Id.ToString());
        visitorIds.Should().Contain(ownerPrivate.Id.ToString());
        visitorIds.Should().NotContain(strangerPrivate.Id.ToString());
        visitor.TotalCount.Should().Be(2);
        (await CardCountAsync(root, Visitor)).Should().Be(visitor.TotalCount);
    }

    [Fact]
    public async Task Owner_SeesOwnPrivateItems_AndCountMatchesRoster()
    {
        Collection root = NewPublicCollection();
        AddItem(root, Owner, isPrivate: false);
        AddItem(root, Owner, isPrivate: true);
        AddItem(root, Stranger, isPrivate: true);
        await DbContext.SaveChangesAsync();

        GetItems.Response owner = await RosterAsync(root, Owner);

        owner.TotalCount.Should().Be(2);
        (await CardCountAsync(root, Owner)).Should().Be(owner.TotalCount);
    }

    [Fact]
    public async Task Visitor_WhoCreatedAPrivateItemInAnotherUsersCollection_SeesOnlyTheirOwnPrivateItem()
    {
        Collection root = NewPublicCollection();
        AddItem(root, Owner, isPrivate: false);
        AddItem(root, Visitor, isPrivate: true);
        AddItem(root, Stranger, isPrivate: true);
        await DbContext.SaveChangesAsync();

        GetItems.Response visitor = await RosterAsync(root, Visitor);

        visitor.TotalCount.Should().Be(2);
        (await CardCountAsync(root, Visitor)).Should().Be(2);
        (await CardCountAsync(root, Stranger)).Should().Be(2);
    }
}
