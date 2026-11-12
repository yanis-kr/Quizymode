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
/// #589 (AC 1.5.1, I3, AC 1.16.7, AC 1.16b.1, AC 1.16c.3). A private item is listed through a membership row only to its own
/// creator, or when the collection holding that row is owned by the item's creator. The root's owner is not consulted, so access
/// through an accessible nested collection owned by the creator counts. The roster, card counts, featured last-modified and image
/// access all apply this rule, so they agree for the same viewer and scope.
/// </summary>
public sealed class CollectionPrivateItemVisibilityTests : DatabaseTestFixture
{
    private const string Owner = "owner-user";
    private const string Visitor = "visitor-user";
    private const string Stranger = "stranger-user";

    private Collection NewCollection(string createdBy, bool isPublic = true)
    {
        Collection collection = new() { Id = Guid.NewGuid(), Name = $"c-{Guid.NewGuid():N}", CreatedBy = createdBy, CreatedAt = DateTime.UtcNow, IsPublic = isPublic };
        DbContext.Collections.Add(collection);
        return collection;
    }

    private void Nest(Collection parent, Collection child) =>
        DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = parent.Id, ChildId = child.Id, AddedAt = DateTime.UtcNow });

    private Item AddItem(Collection collection, string createdBy, bool isPrivate, ItemImageReviewState? review = null)
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
            IsPrivate = isPrivate,
            ImageReviewState = review
        };
        DbContext.Items.Add(item);
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item.Id, AddedAt = DateTime.UtcNow });
        return item;
    }

    private async Task<GetItems.Response> RosterAsync(Collection root, string? viewer)
    {
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(
            new GetItems.QueryRequest(Category: null, IsPrivate: null, Keywords: null, CollectionId: root.Id, IsRandom: null, Page: 1, PageSize: 50),
            DbContext,
            viewer is null ? FakeUserContext.Anonymous : FakeUserContext.User(viewer),
            CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        return result.Value;
    }

    private async Task<int> CardCountAsync(Collection root, string? viewer) =>
        (await CollectionCardCounts.ForCollectionsAsync(DbContext, [root.Id], viewer, CancellationToken.None))[root.Id].ItemCount;

    /// <summary>Checks the roster total and the card count for one viewer; both must equal the expected count. Returns the roster ids.</summary>
    private async Task<HashSet<string>> RosterAndCountAgreeAsync(Collection root, string? viewer, int expectedCount)
    {
        GetItems.Response roster = await RosterAsync(root, viewer);
        int count = await CardCountAsync(root, viewer);
        string who = viewer ?? "anonymous";
        roster.TotalCount.Should().Be(expectedCount, "roster total for {0}", who);
        count.Should().Be(roster.TotalCount, "card count must equal roster total for {0}", who);
        return roster.Items.Select(i => i.Id).ToHashSet();
    }

    [Fact]
    public async Task AnonymousVisitor_SeesPublicAndOwnersPrivate_NotOtherUsersPrivate()
    {
        Collection root = NewCollection(Owner);
        Item shared = AddItem(root, Owner, isPrivate: false);
        Item ownerPrivate = AddItem(root, Owner, isPrivate: true);
        Item visitorPrivate = AddItem(root, Visitor, isPrivate: true);
        Item strangerPrivate = AddItem(root, Stranger, isPrivate: true);
        await DbContext.SaveChangesAsync();

        HashSet<string> ids = await RosterAndCountAgreeAsync(root, null, 2);

        ids.Should().Contain(shared.Id.ToString());
        ids.Should().Contain(ownerPrivate.Id.ToString());
        ids.Should().NotContain(visitorPrivate.Id.ToString());
        ids.Should().NotContain(strangerPrivate.Id.ToString());
    }

    [Fact]
    public async Task Visitor_SeesOwnersPrivateItem_NotAnotherUsersPrivateItem_AndCountMatches()
    {
        Collection root = NewCollection(Owner);
        Item shared = AddItem(root, Owner, isPrivate: false);
        Item ownerPrivate = AddItem(root, Owner, isPrivate: true);
        Item strangerPrivate = AddItem(root, Stranger, isPrivate: true);
        await DbContext.SaveChangesAsync();

        HashSet<string> ids = await RosterAndCountAgreeAsync(root, Visitor, 2);

        ids.Should().Contain(shared.Id.ToString());
        ids.Should().Contain(ownerPrivate.Id.ToString());
        ids.Should().NotContain(strangerPrivate.Id.ToString());
    }

    [Fact]
    public async Task Owner_SeesOwnPrivateItems_NotOtherUsersPrivate_AndCountMatchesRoster()
    {
        Collection root = NewCollection(Owner);
        AddItem(root, Owner, isPrivate: false);
        AddItem(root, Owner, isPrivate: true);
        AddItem(root, Stranger, isPrivate: true);
        await DbContext.SaveChangesAsync();

        await RosterAndCountAgreeAsync(root, Owner, 2);
    }

    [Fact]
    public async Task Creator_InAnotherUsersCollection_SeesOnlyTheirOwnPrivateItem()
    {
        Collection root = NewCollection(Owner);
        AddItem(root, Owner, isPrivate: false);
        Item visitorPrivate = AddItem(root, Visitor, isPrivate: true);
        AddItem(root, Stranger, isPrivate: true);
        await DbContext.SaveChangesAsync();

        HashSet<string> ids = await RosterAndCountAgreeAsync(root, Visitor, 2);
        ids.Should().Contain(visitorPrivate.Id.ToString());

        await RosterAndCountAgreeAsync(root, Stranger, 2);
    }

    [Fact]
    public async Task PrivateItemInNestedCollectionOwnedByItsCreator_IsListedThroughRootOwnedByAnotherUser()
    {
        // Root owned by Owner, nested collection owned by Visitor. Visitor's private item sits in the nested collection.
        Collection root = NewCollection(Owner);
        Collection nested = NewCollection(Visitor);
        Nest(root, nested);
        Item visitorPrivateInNested = AddItem(nested, Visitor, isPrivate: true);
        Item strangerPrivateInNested = AddItem(nested, Stranger, isPrivate: true);
        await DbContext.SaveChangesAsync();

        // Anonymous and unrelated viewers see the creator's private item through the nested collection the creator owns,
        // without owning the root. Another user's private item in that nested collection stays hidden.
        HashSet<string> anon = await RosterAndCountAgreeAsync(root, null, 1);
        anon.Should().Contain(visitorPrivateInNested.Id.ToString());
        anon.Should().NotContain(strangerPrivateInNested.Id.ToString());

        // Stranger sees the nested collection owner's private item (owned holding collection) and their own private item.
        HashSet<string> stranger = await RosterAndCountAgreeAsync(root, Stranger, 2);
        stranger.Should().Contain(visitorPrivateInNested.Id.ToString());
        stranger.Should().Contain(strangerPrivateInNested.Id.ToString());
    }

    [Fact]
    public async Task PrivateItemOfRootOwnerInNestedCollectionOwnedByAnotherUser_IsNotListedToVisitors()
    {
        // The root owner's private item in a nested collection owned by Visitor: the holding collection is not the creator's, so hidden.
        Collection root = NewCollection(Owner);
        Collection nested = NewCollection(Visitor);
        Nest(root, nested);
        AddItem(nested, Owner, isPrivate: true);
        await DbContext.SaveChangesAsync();

        await RosterAndCountAgreeAsync(root, null, 0);
        await RosterAndCountAgreeAsync(root, Owner, 1);
    }

    [Fact]
    public async Task PrivateNestedChildOwnedByAnotherUser_IsHiddenFromVisitors_WithItsWholeSubtree()
    {
        Collection root = NewCollection(Owner);
        Collection hidden = NewCollection(Visitor, isPublic: false);
        Nest(root, hidden);
        Item publicInHidden = AddItem(hidden, Visitor, isPrivate: false);
        AddItem(root, Owner, isPrivate: false);
        await DbContext.SaveChangesAsync();

        HashSet<string> anon = await RosterAndCountAgreeAsync(root, null, 1);
        anon.Should().NotContain(publicInHidden.Id.ToString());

        // The owner of the hidden child sees its contents through the root.
        HashSet<string> visitor = await RosterAndCountAgreeAsync(root, Visitor, 2);
        visitor.Should().Contain(publicInHidden.Id.ToString());
    }

    [Fact]
    public async Task ItemInRootAndNested_IsCountedOnce()
    {
        Collection root = NewCollection(Owner);
        Collection nested = NewCollection(Visitor);
        Nest(root, nested);
        Item visitorPrivate = AddItem(root, Visitor, isPrivate: true);
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = nested.Id, ItemId = visitorPrivate.Id, AddedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();

        await RosterAndCountAgreeAsync(root, Visitor, 1);
        await RosterAndCountAgreeAsync(root, null, 1);
    }

    [Fact]
    public async Task UnapprovedPictures_HideTheItemFromEveryoneButItsCreator_InRosterAndCounts()
    {
        Collection root = NewCollection(Owner);
        Item pendingPublic = AddItem(root, Owner, isPrivate: false, review: ItemImageReviewState.PendingReview);
        Item pendingVisitorPrivate = AddItem(root, Visitor, isPrivate: true, review: ItemImageReviewState.PendingReview);
        AddItem(root, Owner, isPrivate: false);
        await DbContext.SaveChangesAsync();

        HashSet<string> anon = await RosterAndCountAgreeAsync(root, null, 1);
        anon.Should().NotContain(pendingPublic.Id.ToString());

        HashSet<string> owner = await RosterAndCountAgreeAsync(root, Owner, 2);
        owner.Should().Contain(pendingPublic.Id.ToString());

        HashSet<string> visitor = await RosterAndCountAgreeAsync(root, Visitor, 2);
        visitor.Should().Contain(pendingVisitorPrivate.Id.ToString());
    }

    [Fact]
    public async Task ImageAccess_FollowsTheSameRowRule_AsTheRoster()
    {
        Collection root = NewCollection(Owner);
        Collection nested = NewCollection(Visitor);
        Nest(root, nested);
        Item ownerPrivate = AddItem(root, Owner, isPrivate: true);
        Item visitorPrivateInNested = AddItem(nested, Visitor, isPrivate: true);
        Item strangerPrivate = AddItem(root, Stranger, isPrivate: true);
        Collection hidden = NewCollection(Stranger, isPublic: false);
        Nest(root, hidden);
        Item inHidden = AddItem(hidden, Stranger, isPrivate: false);
        await DbContext.SaveChangesAsync();

        (await CollectionScope.ContainsAsync(DbContext, root.Id, ownerPrivate.Id, null, CancellationToken.None)).Should().BeTrue();
        (await CollectionScope.ContainsAsync(DbContext, root.Id, visitorPrivateInNested.Id, null, CancellationToken.None)).Should().BeTrue();
        (await CollectionScope.ContainsAsync(DbContext, root.Id, strangerPrivate.Id, null, CancellationToken.None)).Should().BeFalse();
        (await CollectionScope.ContainsAsync(DbContext, root.Id, strangerPrivate.Id, Stranger, CancellationToken.None)).Should().BeTrue();
        (await CollectionScope.ContainsAsync(DbContext, root.Id, inHidden.Id, null, CancellationToken.None)).Should().BeFalse();
    }
}
