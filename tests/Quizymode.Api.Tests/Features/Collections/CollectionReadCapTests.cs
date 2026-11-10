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

/// <summary>AC 1.16.6: one read resolves at most 50 collections (the root included) and says so when it stops early.</summary>
public sealed class CollectionReadCapTests : ItemTestFixture
{
    private const string Owner = "owner-user";

    private async Task<Collection> CreateCollectionAsync()
    {
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = $"c-{Guid.NewGuid():N}",
            CreatedBy = Owner,
            CreatedAt = DateTime.UtcNow,
            IsPublic = true
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

    /// <summary>Root plus <paramref name="childCount"/> public children, each holding one item of its own.</summary>
    private async Task<Collection> BuildRootAsync(int childCount)
    {
        Collection root = await CreateCollectionAsync();
        for (int i = 0; i < childCount; i++)
        {
            Collection child = await CreateCollectionAsync();
            Item item = await CreateItemWithCategoryAsync("geography", $"Q{i}", "A", new List<string>(), "", isPrivate: false, createdBy: Owner);
            DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = child.Id, ItemId = item.Id });
            DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = root.Id, ChildId = child.Id });
        }
        await DbContext.SaveChangesAsync();
        return root;
    }

    private async Task<Result<GetItems.Response>> ReadItemsAsync(Collection root) =>
        await GetItemsHandler.HandleAsync(
            new GetItems.QueryRequest(Category: null, IsPrivate: null, Keywords: null, CollectionId: root.Id, IsRandom: null, Page: 1, PageSize: 100),
            DbContext,
            UserContext(Owner).Object,
            CancellationToken.None);

    [Fact]
    public async Task ItemsRead_At50Collections_IsComplete()
    {
        // The root plus 49 children is exactly the cap.
        Collection root = await BuildRootAsync(childCount: 49);

        Result<GetItems.Response> result = await ReadItemsAsync(root);

        result.IsSuccess.Should().BeTrue();
        result.Value.Incomplete.Should().BeFalse();
        result.Value.IncompleteReason.Should().BeNull();
        result.Value.TotalCount.Should().Be(49);
    }

    [Fact]
    public async Task ItemsRead_Beyond50Collections_IsIncomplete_AndKeepsTheCappedMembersItems()
    {
        // The root plus 50 children is one past the cap: the root and 49 children are read, the rest are reported.
        Collection root = await BuildRootAsync(childCount: 50);

        Result<GetItems.Response> result = await ReadItemsAsync(root);

        result.IsSuccess.Should().BeTrue();
        result.Value.Incomplete.Should().BeTrue();
        result.Value.IncompleteReason.Should().Be("CollectionLimit");
        result.Value.TotalCount.Should().Be(49);
    }

    [Fact]
    public async Task CollectionRead_Beyond50Collections_IsIncomplete()
    {
        Collection root = await BuildRootAsync(childCount: 50);

        Result<GetCollectionById.Response> result = await GetCollectionById.HandleAsync(root.Id, DbContext, UserContext(Owner).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Incomplete.Should().BeTrue();
        result.Value.IncompleteReason.Should().Be("CollectionLimit");
    }

    [Fact]
    public async Task CollectionRead_Within50Collections_IsComplete()
    {
        Collection root = await BuildRootAsync(childCount: 3);

        Result<GetCollectionById.Response> result = await GetCollectionById.HandleAsync(root.Id, DbContext, UserContext(Owner).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Incomplete.Should().BeFalse();
    }
}
