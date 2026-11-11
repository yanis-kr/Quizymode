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

public sealed class CollectionTopicMembersTests : ItemTestFixture
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

    /// <summary>Creates a category with a two-level path: Keyword1 at the top, Keyword2 under it.</summary>
    private async Task<(Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id)> CreatePathAsync(bool categoryPrivate = false)
    {
        Category category = new()
        {
            Id = Guid.NewGuid(),
            Name = $"cat-{Guid.NewGuid():N}",
            IsPrivate = categoryPrivate,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };
        Keyword k1 = new() { Id = Guid.NewGuid(), Name = $"k1-{Guid.NewGuid():N}", IsPrivate = false, CreatedBy = "test", CreatedAt = DateTime.UtcNow };
        Keyword k2 = new() { Id = Guid.NewGuid(), Name = $"k2-{Guid.NewGuid():N}", IsPrivate = false, CreatedBy = "test", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(k1, k2);
        DbContext.KeywordRelations.AddRange(
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = k1.Id, SortOrder = 0 },
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = k1.Id, ChildKeywordId = k2.Id, SortOrder = 0 });
        await DbContext.SaveChangesAsync();
        return (category.Id, k1.Id, k2.Id);
    }

    private async Task<Item> AddPathItemAsync((Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path, string createdBy, bool isPrivate)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = $"Q-{Guid.NewGuid():N}",
            CorrectAnswer = "A",
            FuzzySignature = Guid.NewGuid().ToString("N"),
            FuzzyBucket = 1,
            IsPrivate = isPrivate,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            CategoryId = path.CategoryId,
            NavigationKeywordId1 = path.Keyword1Id,
            NavigationKeywordId2 = path.Keyword2Id
        };
        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();
        return item;
    }

    private async Task<Result<CollectionTopicMembers.TopicMemberResponse>> AddTopicAsync(
        Collection parent, (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path, string caller, Guid? keyword2 = null) =>
        await CollectionTopicMembers.HandleAddAsync(
            parent.Id,
            new CollectionTopicMembers.AddRequest(path.CategoryId, path.Keyword1Id, keyword2 ?? path.Keyword2Id),
            DbContext,
            UserContext(caller).Object,
            CancellationToken.None);

    private async Task<Result<GetItems.Response>> ReadAsync(Collection collection, string viewer) =>
        await GetItemsHandler.HandleAsync(
            new GetItems.QueryRequest(Category: null, IsPrivate: null, Keywords: null, CollectionId: collection.Id, IsRandom: null, Page: 1, PageSize: 50),
            DbContext,
            UserContext(viewer).Object,
            CancellationToken.None);

    [Fact]
    public async Task HandleAddAsync_OwnerAddsPublicPath_Succeeds()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();

        Result<CollectionTopicMembers.TopicMemberResponse> result = await AddTopicAsync(parent, path, Owner);

        result.IsSuccess.Should().BeTrue();
        DbContext.CollectionKeywordMembers.Should().ContainSingle(m => m.ParentId == parent.Id && m.CategoryId == path.CategoryId);
    }

    [Fact]
    public async Task HandleAddAsync_PrivateCategory_ReturnsNotFound()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync(categoryPrivate: true);

        Result<CollectionTopicMembers.TopicMemberResponse> result = await AddTopicAsync(parent, path, Owner, keyword2: null);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAddAsync_MissingRelation_ReturnsNotFound()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();

        Result<CollectionTopicMembers.TopicMemberResponse> result = await AddTopicAsync(parent, path, Owner, keyword2: Guid.NewGuid());

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAddAsync_NonOwnerOnPublicParent_ReturnsForbidden()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();

        Result<CollectionTopicMembers.TopicMemberResponse> result = await AddTopicAsync(parent, path, Other);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be(CollectionWriteAccess.ForbiddenCode);
    }

    [Fact]
    public async Task HandleAddAsync_Duplicate_IsIdempotent()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();
        (await AddTopicAsync(parent, path, Owner)).IsSuccess.Should().BeTrue();

        Result<CollectionTopicMembers.TopicMemberResponse> again = await AddTopicAsync(parent, path, Owner);

        again.IsSuccess.Should().BeTrue();
        DbContext.CollectionKeywordMembers.Count(m => m.ParentId == parent.Id).Should().Be(1);
    }

    [Fact]
    public async Task Read_ShowsPublicTopicItems_AndHidesOtherUsersPrivateMatches()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();
        (await AddTopicAsync(parent, path, Owner)).IsSuccess.Should().BeTrue();
        Item publicItem = await AddPathItemAsync(path, createdBy: "test", isPrivate: false);
        Item otherPrivate = await AddPathItemAsync(path, createdBy: Other, isPrivate: true);
        Item ownerPrivate = await AddPathItemAsync(path, createdBy: Owner, isPrivate: true);

        Result<GetItems.Response> forOther = await ReadAsync(parent, Other);
        Result<GetItems.Response> forOwner = await ReadAsync(parent, Owner);

        // Each viewer sees the public matches and their own private matches, never someone else's private match.
        forOther.Value.Items.Select(i => i.Id).Should().BeEquivalentTo(new[] { publicItem.Id.ToString(), otherPrivate.Id.ToString() });
        forOwner.Value.Items.Select(i => i.Id).Should().BeEquivalentTo(new[] { publicItem.Id.ToString(), ownerPrivate.Id.ToString() });
    }

    [Fact]
    public async Task List_RemovedPath_IsFlaggedAndCountsZero()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();
        (await AddTopicAsync(parent, path, Owner)).IsSuccess.Should().BeTrue();
        await AddPathItemAsync(path, createdBy: "test", isPrivate: false);

        // Remove the L2 relation: the path no longer exists in the taxonomy.
        KeywordRelation level2 = DbContext.KeywordRelations.Single(r => r.ParentKeywordId == path.Keyword1Id);
        DbContext.KeywordRelations.Remove(level2);
        await DbContext.SaveChangesAsync();

        Result<List<CollectionTopicMembers.TopicMemberResponse>> list =
            await CollectionTopicMembers.HandleListAsync(parent.Id, DbContext, UserContext(Owner).Object, CancellationToken.None);

        list.Value.Should().ContainSingle().Which.IsRemoved.Should().BeTrue();
        list.Value[0].VisibleItemCount.Should().Be(0);
    }

    [Fact]
    public async Task List_ReturnsPathNamesAndAddedAt_ForDisplay()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();
        (await AddTopicAsync(parent, path, Owner)).IsSuccess.Should().BeTrue();

        Result<List<CollectionTopicMembers.TopicMemberResponse>> list =
            await CollectionTopicMembers.HandleListAsync(parent.Id, DbContext, UserContext(Owner).Object, CancellationToken.None);

        CollectionTopicMembers.TopicMemberResponse topic = list.Value.Should().ContainSingle().Subject;
        topic.CategoryName.Should().StartWith("cat-");
        topic.Keyword1Name.Should().StartWith("k1-");
        topic.Keyword2Name.Should().StartWith("k2-");
        topic.AddedAt.Should().BeAfter(DateTime.UtcNow.AddMinutes(-5));
    }

    [Fact]
    public async Task List_MoreThan500VisibleItems_IsFlaggedButNotTruncated()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();
        (await AddTopicAsync(parent, path, Owner)).IsSuccess.Should().BeTrue();
        for (int i = 0; i < CollectionTopicMembers.LargeTopicThreshold + 1; i++)
        {
            DbContext.Items.Add(new Item
            {
                Id = Guid.NewGuid(),
                Question = $"bulk-{i}",
                CorrectAnswer = "A",
                FuzzySignature = Guid.NewGuid().ToString("N"),
                FuzzyBucket = 1,
                IsPrivate = false,
                CreatedBy = "test",
                CreatedAt = DateTime.UtcNow,
                CategoryId = path.CategoryId,
                NavigationKeywordId1 = path.Keyword1Id,
                NavigationKeywordId2 = path.Keyword2Id
            });
        }
        await DbContext.SaveChangesAsync();

        Result<List<CollectionTopicMembers.TopicMemberResponse>> list =
            await CollectionTopicMembers.HandleListAsync(parent.Id, DbContext, UserContext(Owner).Object, CancellationToken.None);

        list.Value[0].VisibleItemCount.Should().Be(CollectionTopicMembers.LargeTopicThreshold + 1);
        list.Value[0].ExceedsWarningThreshold.Should().BeTrue();
    }

    [Fact]
    public async Task HandleRemoveAsync_RemovesMember()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        var path = await CreatePathAsync();
        Result<CollectionTopicMembers.TopicMemberResponse> added = await AddTopicAsync(parent, path, Owner);

        Result removed = await CollectionTopicMembers.HandleRemoveAsync(
            parent.Id, Guid.Parse(added.Value.Id), DbContext, UserContext(Owner).Object, CancellationToken.None);

        removed.IsSuccess.Should().BeTrue();
        DbContext.CollectionKeywordMembers.Should().BeEmpty();
    }
}
