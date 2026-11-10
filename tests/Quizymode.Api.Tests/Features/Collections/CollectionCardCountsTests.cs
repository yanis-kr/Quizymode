using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>
/// Issue #554 part 2: per-viewer card counts. The lead total is distinct visible questions across direct, nested and topic
/// content; the member count is the visible direct members. Both come from one SQL statement per page.
/// </summary>
public sealed class CollectionCardCountsTests : DatabaseTestFixture
{
    private const string Owner = "owner-user";
    private const string Other = "other-user";
    private readonly SqlCaptureInterceptor _sql;

    public CollectionCardCountsTests() : this(new SqlCaptureInterceptor())
    {
    }

    private CollectionCardCountsTests(SqlCaptureInterceptor sql) : base([sql])
    {
        _sql = sql;
    }

    private async Task<Collection> CreateCollectionAsync(string createdBy, bool isPublic, bool isDiscoverable = false, string? name = null)
    {
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = name ?? $"c-{Guid.NewGuid():N}",
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsPublic = isPublic,
            IsDiscoverable = isDiscoverable
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

    private async Task<Item> CreateItemAsync(
        string createdBy,
        bool isPrivate = false,
        ItemImageReviewState? review = null,
        string? question = null,
        (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id)? path = null)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = question ?? $"Q-{Guid.NewGuid():N}",
            CorrectAnswer = "A",
            FuzzySignature = Guid.NewGuid().ToString("N"),
            FuzzyBucket = 1,
            IsPrivate = isPrivate,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            ImageReviewState = review,
            CategoryId = path?.CategoryId,
            NavigationKeywordId1 = path?.Keyword1Id,
            NavigationKeywordId2 = path?.Keyword2Id
        };
        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();
        return item;
    }

    private async Task AddItemAsync(Collection collection, Item item)
    {
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item.Id });
        await DbContext.SaveChangesAsync();
    }

    /// <summary>A category with a two-level live path: Keyword1 at the top, Keyword2 under it.</summary>
    private async Task<(Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id)> CreatePathAsync()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = $"cat-{Guid.NewGuid():N}", IsPrivate = false, CreatedBy = "test", CreatedAt = DateTime.UtcNow };
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

    private async Task AddTopicAsync(Collection parent, (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path)
    {
        DbContext.CollectionKeywordMembers.Add(new CollectionKeywordMember
        {
            Id = Guid.NewGuid(),
            ParentId = parent.Id,
            CategoryId = path.CategoryId,
            Keyword1Id = path.Keyword1Id,
            Keyword2Id = path.Keyword2Id
        });
        await DbContext.SaveChangesAsync();
    }

    private static IUserContext Viewer(string? userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId ?? string.Empty);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(userId is not null);
        return ctx.Object;
    }

    private async Task<CollectionCardCounts.Counts> CountsAsync(Collection collection, string? viewer)
    {
        Dictionary<Guid, CollectionCardCounts.Counts> counts =
            await CollectionCardCounts.ForCollectionsAsync(DbContext, [collection.Id], viewer, CancellationToken.None);
        return counts[collection.Id];
    }

    [Fact]
    public async Task ItemCount_IsDistinct_AcrossDirectNestedAndTopicContent()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection child = await CreateCollectionAsync(Owner, isPublic: true);
        await LinkAsync(parent, child);
        (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path = await CreatePathAsync();
        await AddTopicAsync(parent, path);

        Item a = await CreateItemAsync(Owner);
        Item b = await CreateItemAsync(Owner);
        await CreateItemAsync(Other, path: path);
        await AddItemAsync(parent, a);
        await AddItemAsync(child, a);
        await AddItemAsync(child, b);

        CollectionCardCounts.Counts counts = await CountsAsync(parent, viewer: null);

        // A is in both the parent and the child but counts once; B is nested; the topic match is a visible question on a live path.
        counts.ItemCount.Should().Be(3);
        // Visible direct members: one direct question (A), one visible child link, one live topic path.
        counts.MemberCount.Should().Be(3);
    }

    [Fact]
    public async Task ItemCount_ExcludesQuestionsAwaitingPictureReview_ForOthers_ButNotForCreator()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Item pending = await CreateItemAsync(Owner, review: ItemImageReviewState.PendingReview);
        await AddItemAsync(parent, pending);

        (await CountsAsync(parent, Other)).Should().Be(new CollectionCardCounts.Counts(0, 0));
        (await CountsAsync(parent, Owner)).Should().Be(new CollectionCardCounts.Counts(1, 1));
    }

    [Fact]
    public async Task PrivateChild_ContributesNoItemsOrMembers_ToAnonymous_ButTheOwnerSeesThem()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        Collection privateChild = await CreateCollectionAsync(Owner, isPublic: false);
        await LinkAsync(parent, privateChild);
        Item inside = await CreateItemAsync(Owner);
        await AddItemAsync(privateChild, inside);

        (await CountsAsync(parent, viewer: null)).Should().Be(new CollectionCardCounts.Counts(0, 0));
        (await CountsAsync(parent, Owner)).Should().Be(new CollectionCardCounts.Counts(1, 1));
    }

    [Fact]
    public async Task TopicMatch_ByAnotherUsersPrivateQuestion_IsNotCountedForOthers()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path = await CreatePathAsync();
        await AddTopicAsync(parent, path);
        await CreateItemAsync(Other, isPrivate: true, path: path);

        // The live path still counts as one visible member; the private question is not Owner's to see.
        (await CountsAsync(parent, Owner)).Should().Be(new CollectionCardCounts.Counts(0, 1));
        (await CountsAsync(parent, Other)).Should().Be(new CollectionCardCounts.Counts(1, 1));
    }

    [Fact]
    public async Task RemovedTopicPath_ContributesNoItemsOrMembers()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true);
        (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path = await CreatePathAsync();
        await AddTopicAsync(parent, path);
        await CreateItemAsync(Owner, path: path);

        KeywordRelation top = await DbContext.KeywordRelations.SingleAsync(r => r.CategoryId == path.CategoryId && r.ParentKeywordId == null);
        DbContext.KeywordRelations.Remove(top);
        await DbContext.SaveChangesAsync();

        (await CountsAsync(parent, Owner)).Should().Be(new CollectionCardCounts.Counts(0, 0));
    }

    [Fact]
    public async Task CollectionsList_IssuesTheSameNumberOfSqlCommands_RegardlessOfPageSize()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(Owner);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);

        Collection first = await CreateCollectionAsync(Owner, isPublic: false);
        await AddItemAsync(first, await CreateItemAsync(Owner));

        int before = _sql.Commands.Count;
        (await GetCollections.HandleAsync(DbContext, ctx.Object, CancellationToken.None)).IsSuccess.Should().BeTrue();
        int singlePage = _sql.Commands.Count - before;

        for (int i = 0; i < 4; i++)
        {
            Collection extra = await CreateCollectionAsync(Owner, isPublic: false);
            await AddItemAsync(extra, await CreateItemAsync(Owner));
        }

        before = _sql.Commands.Count;
        Result<GetCollections.Response> fivePages = await GetCollections.HandleAsync(DbContext, ctx.Object, CancellationToken.None);
        int fivePage = _sql.Commands.Count - before;

        fivePages.Value.Collections.Should().HaveCount(5);
        fivePage.Should().Be(singlePage, "the card counts must take a fixed number of statements per page, not one per collection");
    }

    [Fact]
    public async Task Discover_TextSearch_DoesNotMatchNestedCollectionNames()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true, isDiscoverable: true, name: "Alpha list");
        Collection child = await CreateCollectionAsync(Owner, isPublic: true, isDiscoverable: false, name: "Zetanested child");
        await LinkAsync(parent, child);

        Result<DiscoverCollections.Response> nestedOnly = await DiscoverCollections.HandleAsync(
            "Zetanested", null, null, null, 1, 20, DbContext, Viewer(Other), CancellationToken.None);
        Result<DiscoverCollections.Response> parentOwn = await DiscoverCollections.HandleAsync(
            "Alpha", null, null, null, 1, 20, DbContext, Viewer(Other), CancellationToken.None);

        nestedOnly.Value.TotalCount.Should().Be(0, "a nested collection's name is not searched through its parent");
        parentOwn.Value.TotalCount.Should().Be(1);
        parentOwn.Value.Items.Single().MemberCount.Should().Be(1, "the parent's visible child link is a member");
    }

    [Fact]
    public async Task Discover_TextSearch_DoesNotMatchTopicOrItemText()
    {
        Collection parent = await CreateCollectionAsync(Owner, isPublic: true, isDiscoverable: true, name: "Plain list");
        (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path = await CreatePathAsync();
        await AddTopicAsync(parent, path);
        await CreateItemAsync(Owner, question: "Yottaquestion unique text", path: path);

        Result<DiscoverCollections.Response> result = await DiscoverCollections.HandleAsync(
            "Yottaquestion", null, null, null, 1, 20, DbContext, Viewer(Other), CancellationToken.None);

        result.Value.TotalCount.Should().Be(0, "search matches collection name and description only, never topic or question text");
    }
}
