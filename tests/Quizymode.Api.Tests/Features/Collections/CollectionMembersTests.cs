using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using GetItemsHandler = Quizymode.Api.Features.Items.Get.GetItemsHandler;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class CollectionMembersTests : ItemTestFixture
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

    private static Mock<IUserContext> UserContext(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        return ctx;
    }

    private async Task<Result<CollectionMembers.CollectionMemberResponse>> AddAsync(Collection parent, Collection child, string caller) =>
        await CollectionMembers.HandleAddAsync(
            parent.Id,
            new CollectionMembers.AddRequest(child.Id),
            DbContext,
            UserContext(caller).Object,
            CancellationToken.None);

    private static string ErrorCode<T>(Result<T> result) => result.Error.Code;

    [Fact]
    public async Task HandleAddAsync_OwnerAddsPublicChild_Succeeds()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection child = await CreateCollectionAsync(Owner, isPublic: true);

        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(parent, child, Owner);

        result.IsSuccess.Should().BeTrue();
        DbContext.CollectionCollectionMembers.Should().ContainSingle(m => m.ParentId == parent.Id && m.ChildId == child.Id);
    }

    [Fact]
    public async Task HandleAddAsync_SelfLink_ReturnsCycleError()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);

        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(parent, parent, Owner);

        result.IsFailure.Should().BeTrue();
        ErrorCode(result).Should().Be("CollectionMembers.Cycle");
    }

    [Fact]
    public async Task HandleAddAsync_TwoCollectionCycle_ReturnsCycleError()
    {
        Collection a = await CreateCollectionAsync(Owner, isPublic: true);
        Collection b = await CreateCollectionAsync(Owner, isPublic: true);
        (await AddAsync(a, b, Owner)).IsSuccess.Should().BeTrue();

        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(b, a, Owner);

        result.IsFailure.Should().BeTrue();
        ErrorCode(result).Should().Be("CollectionMembers.Cycle");
    }

    [Fact]
    public async Task HandleAddAsync_ThreeCollectionCycle_ReturnsCycleError()
    {
        Collection a = await CreateCollectionAsync(Owner, isPublic: true);
        Collection b = await CreateCollectionAsync(Owner, isPublic: true);
        Collection c = await CreateCollectionAsync(Owner, isPublic: true);
        (await AddAsync(a, b, Owner)).IsSuccess.Should().BeTrue();
        (await AddAsync(b, c, Owner)).IsSuccess.Should().BeTrue();

        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(c, a, Owner);

        result.IsFailure.Should().BeTrue();
        ErrorCode(result).Should().Be("CollectionMembers.Cycle");
    }

    [Fact]
    public async Task HandleAddAsync_ThreeLevels_Allowed_FourLevels_Rejected()
    {
        // root -> a -> b -> c is three links: allowed.
        Collection root = await CreateCollectionAsync(Owner, isPublic: true);
        Collection a = await CreateCollectionAsync(Owner, isPublic: true);
        Collection b = await CreateCollectionAsync(Owner, isPublic: true);
        Collection c = await CreateCollectionAsync(Owner, isPublic: true);
        Collection d = await CreateCollectionAsync(Owner, isPublic: true);
        (await AddAsync(root, a, Owner)).IsSuccess.Should().BeTrue();
        (await AddAsync(a, b, Owner)).IsSuccess.Should().BeTrue();
        (await AddAsync(b, c, Owner)).IsSuccess.Should().BeTrue();

        // Fourth link: root -> a -> b -> c -> d.
        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(c, d, Owner);

        result.IsFailure.Should().BeTrue();
        ErrorCode(result).Should().Be("CollectionMembers.TooDeep");
    }

    [Fact]
    public async Task HandleAddAsync_GraftingDeepSubtree_UnderDeepParent_Rejected()
    {
        // root -> a -> b (two links), plus x -> y (one link): grafting x under b makes root -> a -> b -> x -> y, four links.
        Collection root = await CreateCollectionAsync(Owner, isPublic: true);
        Collection a = await CreateCollectionAsync(Owner, isPublic: true);
        Collection b = await CreateCollectionAsync(Owner, isPublic: true);
        Collection x = await CreateCollectionAsync(Owner, isPublic: true);
        Collection y = await CreateCollectionAsync(Owner, isPublic: true);
        (await AddAsync(root, a, Owner)).IsSuccess.Should().BeTrue();
        (await AddAsync(a, b, Owner)).IsSuccess.Should().BeTrue();
        (await AddAsync(x, y, Owner)).IsSuccess.Should().BeTrue();

        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(b, x, Owner);

        result.IsFailure.Should().BeTrue();
        ErrorCode(result).Should().Be("CollectionMembers.TooDeep");
    }

    [Fact]
    public async Task HandleAddAsync_NonOwnerOnPrivateParent_ReturnsNotFound()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: false);
        Collection child = await CreateCollectionAsync(Other, isPublic: true);

        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(parent, child, Other);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAddAsync_NonOwnerOnPublicParent_ReturnsForbidden()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection child = await CreateCollectionAsync(Other, isPublic: true);

        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(parent, child, Other);

        result.IsFailure.Should().BeTrue();
        ErrorCode(result).Should().Be(CollectionWriteAccess.ForbiddenCode);
    }

    [Fact]
    public async Task HandleAddAsync_PrivateChildOwnedBySomeoneElse_ReturnsNotFound()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection child = await CreateCollectionAsync(Other, isPublic: false);

        Result<CollectionMembers.CollectionMemberResponse> result = await AddAsync(parent, child, Owner);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAddAsync_Duplicate_IsIdempotent()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection child = await CreateCollectionAsync(Owner, isPublic: true);
        (await AddAsync(parent, child, Owner)).IsSuccess.Should().BeTrue();

        Result<CollectionMembers.CollectionMemberResponse> again = await AddAsync(parent, child, Owner);

        again.IsSuccess.Should().BeTrue();
        DbContext.CollectionCollectionMembers.Count(m => m.ParentId == parent.Id && m.ChildId == child.Id).Should().Be(1);
    }

    [Fact]
    public async Task HandleRemoveAsync_RemovesLink_ThenNotFound()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection child = await CreateCollectionAsync(Owner, isPublic: true);
        (await AddAsync(parent, child, Owner)).IsSuccess.Should().BeTrue();

        Result first = await CollectionMembers.HandleRemoveAsync(parent.Id, child.Id, DbContext, UserContext(Owner).Object, CancellationToken.None);
        Result second = await CollectionMembers.HandleRemoveAsync(parent.Id, child.Id, DbContext, UserContext(Owner).Object, CancellationToken.None);

        first.IsSuccess.Should().BeTrue();
        second.Error.Type.Should().Be(ErrorType.NotFound);
        DbContext.CollectionCollectionMembers.Should().BeEmpty();
    }

    [Fact]
    public async Task GetItems_CycleStoredInData_StillReturnsSuccess()
    {
        Collection a = await CreateCollectionAsync(Owner, isPublic: true);
        Collection b = await CreateCollectionAsync(Owner, isPublic: true);
        Item item = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: Owner);
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = b.Id, ItemId = item.Id });
        // Written directly, bypassing the write checks: a -> b -> a.
        DbContext.CollectionCollectionMembers.AddRange(
            new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = a.Id, ChildId = b.Id },
            new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = b.Id, ChildId = a.Id });
        await DbContext.SaveChangesAsync();

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: a.Id, IsRandom: null, Page: 1, PageSize: 10);

        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, UserContext(Owner).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().ContainSingle().Which.Id.Should().Be(item.Id.ToString());
    }

    [Fact]
    public async Task GetItems_PrivateNestedChild_ItemsVisibleToOwnerOnly()
    {
        Collection root = await CreateCollectionAsync(Owner, isPublic: true);
        Collection privateChild = await CreateCollectionAsync(Owner, isPublic: false);
        Item childItem = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: Owner);
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = privateChild.Id, ItemId = childItem.Id });
        await DbContext.SaveChangesAsync();
        (await AddAsync(root, privateChild, Owner)).IsSuccess.Should().BeTrue();

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: root.Id, IsRandom: null, Page: 1, PageSize: 10);

        Result<GetItems.Response> forOther = await GetItemsHandler.HandleAsync(request, DbContext, UserContext(Other).Object, CancellationToken.None);
        Result<GetItems.Response> forOwner = await GetItemsHandler.HandleAsync(request, DbContext, UserContext(Owner).Object, CancellationToken.None);

        forOther.Value.Items.Should().BeEmpty();
        forOwner.Value.Items.Should().ContainSingle().Which.Id.Should().Be(childItem.Id.ToString());
    }
}
