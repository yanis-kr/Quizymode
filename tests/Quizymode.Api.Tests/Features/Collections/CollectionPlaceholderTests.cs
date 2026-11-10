using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class CollectionPlaceholderTests : DatabaseTestFixture
{
    private const string Owner = "owner-user";
    private const string Other = "other-user";

    private async Task<Collection> CreateCollectionAsync(string createdBy, bool isPublic)
    {
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = $"c-{Guid.NewGuid():N}",
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsPublic = isPublic
        };
        DbContext.Collections.Add(collection);
        await DbContext.SaveChangesAsync();
        return collection;
    }

    private async Task LinkAsync(Collection parent, Collection child)
    {
        DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = parent.Id, ChildId = child.Id });
        await DbContext.SaveChangesAsync();
    }

    private static IUserContext Viewer(string? userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId ?? string.Empty);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(userId is not null);
        return ctx.Object;
    }

    [Fact]
    public async Task OtherViewer_SeesPlaceholderCountOnly_ForPrivateChild()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection privateChild = await CreateCollectionAsync(Owner, isPublic: false);
        await LinkAsync(parent, privateChild);

        Result<CollectionMembers.ChildrenResponse> children = await CollectionMembers.HandleChildrenAsync(parent.Id, DbContext, Viewer(Other), CancellationToken.None);
        Result<GetCollectionById.Response> detail = await GetCollectionById.HandleAsync(parent.Id, DbContext, Viewer(Other), CancellationToken.None);

        children.IsSuccess.Should().BeTrue();
        children.Value.Children.Should().BeEmpty();
        children.Value.HiddenCollectionCount.Should().Be(1);
        detail.Value.HiddenCollectionCount.Should().Be(1);
    }

    [Fact]
    public async Task Anonymous_SeesPlaceholderCount_ForPrivateChild()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection privateChild = await CreateCollectionAsync(Owner, isPublic: false);
        await LinkAsync(parent, privateChild);

        Result<CollectionMembers.ChildrenResponse> children = await CollectionMembers.HandleChildrenAsync(parent.Id, DbContext, Viewer(null), CancellationToken.None);

        children.Value.Children.Should().BeEmpty();
        children.Value.HiddenCollectionCount.Should().Be(1);
    }

    [Fact]
    public async Task Owner_SeesOwnPrivateChild_AsHiddenFromOthers_AndNoPlaceholder()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection privateChild = await CreateCollectionAsync(Owner, isPublic: false);
        await LinkAsync(parent, privateChild);

        Result<CollectionMembers.ChildrenResponse> children = await CollectionMembers.HandleChildrenAsync(parent.Id, DbContext, Viewer(Owner), CancellationToken.None);

        children.Value.Children.Should().ContainSingle().Which.HiddenFromOthers.Should().BeTrue();
        children.Value.HiddenCollectionCount.Should().Be(0);
    }

    [Fact]
    public async Task HiddenChildsOwnChildren_AreNotCounted()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection privateChild = await CreateCollectionAsync(Owner, isPublic: false);
        Collection grandchild = await CreateCollectionAsync(Owner, isPublic: true);
        await LinkAsync(parent, privateChild);
        await LinkAsync(privateChild, grandchild);

        Result<CollectionMembers.ChildrenResponse> children = await CollectionMembers.HandleChildrenAsync(parent.Id, DbContext, Viewer(Other), CancellationToken.None);

        children.Value.HiddenCollectionCount.Should().Be(1, "only the direct private link is counted, never its descendants");
    }

    [Fact]
    public async Task MixedChildren_CountsOnlyLinksTheViewerCannotOpen()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection publicChild = await CreateCollectionAsync(Owner, isPublic: true);
        Collection privateChild = await CreateCollectionAsync(Owner, isPublic: false);
        Collection otherPrivate = await CreateCollectionAsync(Other, isPublic: false);
        await LinkAsync(parent, publicChild);
        await LinkAsync(parent, privateChild);
        await LinkAsync(parent, otherPrivate);

        Result<CollectionMembers.ChildrenResponse> forOther = await CollectionMembers.HandleChildrenAsync(parent.Id, DbContext, Viewer(Other), CancellationToken.None);
        Result<CollectionMembers.ChildrenResponse> forOwner = await CollectionMembers.HandleChildrenAsync(parent.Id, DbContext, Viewer(Owner), CancellationToken.None);

        forOther.Value.Children.Select(c => c.Id).Should().BeEquivalentTo(new[] { publicChild.Id.ToString(), otherPrivate.Id.ToString() });
        forOther.Value.HiddenCollectionCount.Should().Be(1, "the owner's private child is hidden; the other user's own private child is visible to them");
        forOwner.Value.HiddenCollectionCount.Should().Be(1, "the other user's private child stays hidden from the owner");
        forOwner.Value.Children.Should().HaveCount(2);
    }

    [Fact]
    public async Task PrivateParent_ReturnsNotFoundForOthers()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: false);

        Result<CollectionMembers.ChildrenResponse> result = await CollectionMembers.HandleChildrenAsync(parent.Id, DbContext, Viewer(Other), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}
