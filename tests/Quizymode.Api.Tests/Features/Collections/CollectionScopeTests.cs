using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>
/// #551: one resolver for every membership read. Depth 3, 50 collections and 500 membership rows per nested collection;
/// a result cut by a limit reports why. Rows are seeded straight into the tables, which bypasses the write guard on purpose.
/// </summary>
public sealed class CollectionScopeTests : DatabaseTestFixture
{
    private const string Owner = "owner-user";
    private const string Other = "other-user";
    private const string Third = "third-user";
    private static readonly DateTime Start = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private Collection AddCollection(string createdBy = Owner, bool isPublic = true)
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
        return collection;
    }

    private Item NewItem(string createdBy = Owner, bool isPrivate = false, (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id)? path = null)
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
            CategoryId = path?.CategoryId,
            NavigationKeywordId1 = path?.Keyword1Id,
            NavigationKeywordId2 = path?.Keyword2Id
        };
        DbContext.Items.Add(item);
        return item;
    }

    /// <summary>Adds <paramref name="count"/> public items to the collection, AddedAt one second apart starting at <paramref name="offset"/>; returns their ids in AddedAt order.</summary>
    private List<Guid> AddItems(Collection collection, int count, int offset = 0)
    {
        List<Guid> ids = [];
        for (int i = 0; i < count; i++)
        {
            Item item = NewItem();
            DbContext.CollectionItems.Add(new CollectionItem
            {
                Id = Guid.NewGuid(),
                CollectionId = collection.Id,
                ItemId = item.Id,
                AddedAt = Start.AddSeconds(offset + i)
            });
            ids.Add(item.Id);
        }

        return ids;
    }

    private void Link(Collection parent, Collection child, int second = 0) =>
        DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember
        {
            Id = Guid.NewGuid(),
            ParentId = parent.Id,
            ChildId = child.Id,
            AddedAt = Start.AddSeconds(second)
        });

    /// <summary>Topic rows that need no taxonomy: random ids are enough to count as membership rows.</summary>
    private void AddDeadTopicRows(Collection collection, int count, int offset = 0)
    {
        for (int i = 0; i < count; i++)
        {
            DbContext.CollectionKeywordMembers.Add(new CollectionKeywordMember
            {
                Id = Guid.NewGuid(),
                ParentId = collection.Id,
                CategoryId = Guid.NewGuid(),
                Keyword1Id = Guid.NewGuid(),
                Keyword2Id = null,
                AddedAt = Start.AddSeconds(offset + i)
            });
        }
    }

    private async Task<(Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id)> AddLivePathAsync()
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

    private Task<List<Guid>> RosterAsync(Collection root, string? viewer) =>
        CollectionScope.AccessibleMemberItemIds(DbContext, root.Id, viewer).ToListAsync();

    private Task<string?> ReasonAsync(Collection root, string? viewer) =>
        CollectionScope.IncompleteReasonAsync(DbContext, root.Id, viewer, CancellationToken.None);

    private async Task<CollectionCardCounts.Counts> CardAsync(Collection root, string? viewer) =>
        (await CollectionCardCounts.ForCollectionsAsync(DbContext, [root.Id], viewer, CancellationToken.None))[root.Id];

    [Fact]
    public async Task FlatCollection_With600Items_ReturnsAll600_AndIsComplete()
    {
        Collection root = AddCollection();
        List<Guid> ids = AddItems(root, 600);
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, Owner)).Should().BeEquivalentTo(ids);
        (await ReasonAsync(root, Owner)).Should().BeNull();
        (await CardAsync(root, Owner)).Should().Be(new CollectionCardCounts.Counts(600, 600));
    }

    [Fact]
    public async Task FlatCollection_RosterAndCardCount_Unchanged()
    {
        Collection root = AddCollection();
        List<Guid> ids = AddItems(root, 5);
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, null)).Should().BeEquivalentTo(ids);
        (await ReasonAsync(root, null)).Should().BeNull();
        (await CardAsync(root, null)).Should().Be(new CollectionCardCounts.Counts(5, 5));
    }

    [Fact]
    public async Task NestedChild_With501Rows_KeepsFirst500ByAddedAt_ReasonMembershipRowLimit()
    {
        Collection root = AddCollection();
        Collection child = AddCollection();
        Link(root, child);
        List<Guid> ids = AddItems(child, 501);
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, Owner)).Should().BeEquivalentTo(ids.Take(500));
        (await ReasonAsync(root, Owner)).Should().Be(CollectionScope.MembershipRowLimitReason);
    }

    [Fact]
    public async Task NestedChild_WithExactly500Rows_IsComplete()
    {
        Collection root = AddCollection();
        Collection child = AddCollection();
        Link(root, child);
        List<Guid> ids = AddItems(child, 500);
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, Owner)).Should().BeEquivalentTo(ids);
        (await ReasonAsync(root, Owner)).Should().BeNull();
    }

    [Fact]
    public async Task NestedChild_ItemsFillWhatTopicRowsLeave_AndRootItemsAreNeverCut()
    {
        Collection root = AddCollection();
        Collection child = AddCollection();
        Link(root, child);
        List<Guid> rootItems = AddItems(root, 520);
        AddDeadTopicRows(child, 300);
        List<Guid> childItems = AddItems(child, 300);
        await DbContext.SaveChangesAsync();

        // 300 topic rows are ranked first, so only 200 of the child's 300 items fit in its budget of 500.
        List<Guid> expected = rootItems.Concat(childItems.Take(200)).ToList();
        (await RosterAsync(root, Owner)).Should().BeEquivalentTo(expected);
        (await ReasonAsync(root, Owner)).Should().Be(CollectionScope.MembershipRowLimitReason);
        (await CardAsync(root, Owner)).ItemCount.Should().Be(expected.Count);
    }

    [Fact]
    public async Task Root_With501ChildAndTopicRows_IsIncomplete_MembershipRowLimit()
    {
        Collection root = AddCollection();
        for (int i = 0; i < 40; i++)
        {
            Link(root, AddCollection(), second: i);
        }

        AddDeadTopicRows(root, 461, offset: 100);
        await DbContext.SaveChangesAsync();

        (await ReasonAsync(root, Owner)).Should().Be(CollectionScope.MembershipRowLimitReason);
    }

    [Fact]
    public async Task ChainDeeperThan3StoredInData_StopsAtDepth3_ReasonDepthLimit()
    {
        Collection root = AddCollection();
        Collection l1 = AddCollection();
        Collection l2 = AddCollection();
        Collection l3 = AddCollection();
        Collection l4 = AddCollection();
        Link(root, l1);
        Link(l1, l2);
        Link(l2, l3);
        Link(l3, l4);
        List<Guid> reachable = AddItems(l3, 1);
        AddItems(l4, 1);
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, Owner)).Should().BeEquivalentTo(reachable);
        (await ReasonAsync(root, Owner)).Should().Be(CollectionScope.DepthLimitReason);
    }

    [Fact]
    public async Task InaccessibleLevel4Child_DoesNotSetDepthLimit()
    {
        Collection root = AddCollection();
        Collection l1 = AddCollection();
        Collection l2 = AddCollection();
        Collection l3 = AddCollection();
        Collection hiddenL4 = AddCollection(Other, isPublic: false);
        Link(root, l1);
        Link(l1, l2);
        Link(l2, l3);
        Link(l3, hiddenL4);
        await DbContext.SaveChangesAsync();

        (await ReasonAsync(root, Third)).Should().BeNull();
        (await ReasonAsync(root, Other)).Should().Be(CollectionScope.DepthLimitReason);
    }

    [Fact]
    public async Task CycleStoredInData_Terminates_AndIsNotIncomplete()
    {
        Collection root = AddCollection();
        Collection child = AddCollection();
        Link(root, child);
        Link(child, root);
        List<Guid> ids = AddItems(child, 2);
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, Owner)).Should().BeEquivalentTo(ids);
        (await ReasonAsync(root, Owner)).Should().BeNull();
        (await CardAsync(root, Owner)).ItemCount.Should().Be(2);
    }

    [Fact]
    public async Task PrivateChildOfOtherUser_HidesSubtree_OwnerSeesIt()
    {
        Collection root = AddCollection();
        Collection hidden = AddCollection(Owner, isPublic: false);
        Collection grandchild = AddCollection(Owner, isPublic: true);
        Link(root, hidden);
        Link(hidden, grandchild);
        List<Guid> inHidden = AddItems(hidden, 1);
        List<Guid> inGrandchild = AddItems(grandchild, 1);
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, Other)).Should().BeEmpty();
        (await RosterAsync(root, null)).Should().BeEmpty();
        (await RosterAsync(root, Owner)).Should().BeEquivalentTo(inHidden.Concat(inGrandchild));
    }

    [Fact]
    public async Task TopicMember_ShowsPublicAndViewersOwnPrivate_NeverOtherUsersPrivate()
    {
        (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path = await AddLivePathAsync();
        Collection root = AddCollection();
        DbContext.CollectionKeywordMembers.Add(new CollectionKeywordMember
        {
            Id = Guid.NewGuid(), ParentId = root.Id, CategoryId = path.CategoryId, Keyword1Id = path.Keyword1Id, Keyword2Id = path.Keyword2Id
        });
        Item publicItem = NewItem(Other, path: path);
        Item ownerPrivate = NewItem(Owner, isPrivate: true, path: path);
        Item thirdPrivate = NewItem(Third, isPrivate: true, path: path);
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, null)).Should().BeEquivalentTo([publicItem.Id]);
        (await RosterAsync(root, Owner)).Should().BeEquivalentTo([publicItem.Id, ownerPrivate.Id]);
        (await RosterAsync(root, Third)).Should().BeEquivalentTo([publicItem.Id, thirdPrivate.Id]);
    }

    [Fact]
    public async Task ItemReachedDirectNestedAndViaTopic_ReturnedOnce()
    {
        (Guid CategoryId, Guid Keyword1Id, Guid Keyword2Id) path = await AddLivePathAsync();
        Collection root = AddCollection();
        Collection child = AddCollection();
        Link(root, child);
        DbContext.CollectionKeywordMembers.Add(new CollectionKeywordMember
        {
            Id = Guid.NewGuid(), ParentId = root.Id, CategoryId = path.CategoryId, Keyword1Id = path.Keyword1Id, Keyword2Id = path.Keyword2Id
        });
        Item item = NewItem(Owner, path: path);
        DbContext.CollectionItems.AddRange(
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = root.Id, ItemId = item.Id },
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = child.Id, ItemId = item.Id });
        await DbContext.SaveChangesAsync();

        (await RosterAsync(root, Owner)).Should().Equal(item.Id);
        (await CardAsync(root, Owner)).ItemCount.Should().Be(1);
    }

    [Fact]
    public async Task IncompleteReason_Precedence_CollectionLimitBeforeRowLimitBeforeDepth()
    {
        // All three at once: 50 children (the cap is 49 plus the root), one of them over 500 rows, one holding a chain past depth 3.
        Collection all = AddCollection();
        for (int i = 0; i < 50; i++)
        {
            Link(all, AddCollection(), second: i);
        }

        Collection fat = AddCollection();
        Link(all, fat, second: -1);
        AddItems(fat, 501);
        Collection d1 = AddCollection();
        Collection d2 = AddCollection();
        Collection d3 = AddCollection();
        Link(all, d1, second: -2);
        Link(d1, d2);
        Link(d2, d3);
        Link(d3, AddCollection());

        // Row limit and depth, no collection limit.
        Collection rowAndDepth = AddCollection();
        Collection rd = AddCollection();
        Link(rowAndDepth, rd);
        AddItems(rd, 501);
        Collection e1 = AddCollection();
        Collection e2 = AddCollection();
        Collection e3 = AddCollection();
        Link(rowAndDepth, e1);
        Link(e1, e2);
        Link(e2, e3);
        Link(e3, AddCollection());

        // Depth only.
        Collection depthOnly = AddCollection();
        Collection f1 = AddCollection();
        Collection f2 = AddCollection();
        Collection f3 = AddCollection();
        Link(depthOnly, f1);
        Link(f1, f2);
        Link(f2, f3);
        Link(f3, AddCollection());
        await DbContext.SaveChangesAsync();

        (await ReasonAsync(all, Owner)).Should().Be(CollectionScope.CollectionLimitReason);
        (await ReasonAsync(rowAndDepth, Owner)).Should().Be(CollectionScope.MembershipRowLimitReason);
        (await ReasonAsync(depthOnly, Owner)).Should().Be(CollectionScope.DepthLimitReason);
    }

    [Fact]
    public async Task CardCount_EqualsRosterTotal_UnderRowCap()
    {
        Collection root = AddCollection();
        Collection child = AddCollection();
        Link(root, child);
        AddItems(root, 3);
        AddItems(child, 650);
        await DbContext.SaveChangesAsync();

        List<Guid> roster = await RosterAsync(root, null);

        roster.Should().HaveCount(503);
        (await CardAsync(root, null)).ItemCount.Should().Be(roster.Count);
    }

    [Fact]
    public async Task CardCounts_ForTwoRoots_ApplyTheNestedCapOnlyToNestedCollections()
    {
        // The same fat collection is a root (never cut) and, under another root, a nested child (cut to 500).
        Collection fat = AddCollection();
        AddItems(fat, 520);
        Collection holder = AddCollection();
        Link(holder, fat);
        await DbContext.SaveChangesAsync();

        Dictionary<Guid, CollectionCardCounts.Counts> counts =
            await CollectionCardCounts.ForCollectionsAsync(DbContext, [fat.Id, holder.Id], null, CancellationToken.None);

        counts[fat.Id].ItemCount.Should().Be(520);
        counts[holder.Id].ItemCount.Should().Be(500);
        (await RosterAsync(fat, null)).Should().HaveCount(520);
        (await RosterAsync(holder, null)).Should().HaveCount(500);
    }

    [Fact]
    public async Task NestedChild_RowsSharingOneAddedAt_AreCutByIdTieBreak()
    {
        Collection root = AddCollection();
        Collection child = AddCollection();
        Link(root, child);
        List<(Guid RowId, Guid ItemId)> rows = [];
        for (int i = 0; i < 501; i++)
        {
            Item item = NewItem();
            CollectionItem row = new() { Id = Guid.NewGuid(), CollectionId = child.Id, ItemId = item.Id, AddedAt = Start };
            DbContext.CollectionItems.Add(row);
            rows.Add((row.Id, item.Id));
        }

        await DbContext.SaveChangesAsync();

        List<Guid> expected = rows.OrderBy(r => r.RowId.ToString(), StringComparer.Ordinal).Take(500).Select(r => r.ItemId).ToList();
        List<Guid> roster = await RosterAsync(root, Owner);
        roster.Should().BeEquivalentTo(expected);
        (await CardAsync(root, Owner)).ItemCount.Should().Be(roster.Count).And.Be(500);
    }
}
