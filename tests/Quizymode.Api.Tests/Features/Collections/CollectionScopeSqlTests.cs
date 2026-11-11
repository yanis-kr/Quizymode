using System.Text.RegularExpressions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using GetItemsHandler = Quizymode.Api.Features.Items.Get.GetItemsHandler;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>
/// #551 AC2: GET /items?collectionId filters membership with a subquery in the same SQL command as the count and the page. No
/// command carries an id list, and the number of commands does not depend on how many items the collection (or its nested children) holds.
/// </summary>
public sealed class CollectionScopeSqlTests : DatabaseTestFixture
{
    private const string Owner = "owner-user";
    private readonly SqlCaptureInterceptor _sql;

    public CollectionScopeSqlTests() : this(new SqlCaptureInterceptor())
    {
    }

    private CollectionScopeSqlTests(SqlCaptureInterceptor sql) : base([sql])
    {
        _sql = sql;
    }

    private async Task<Collection> SeedAsync(int rootItems, int nestedItems)
    {
        Collection root = NewCollection();
        Collection child = NewCollection();
        DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = root.Id, ChildId = child.Id });
        AddItems(root, rootItems);
        AddItems(child, nestedItems);
        await DbContext.SaveChangesAsync();
        return root;
    }

    private Collection NewCollection()
    {
        Collection collection = new() { Id = Guid.NewGuid(), Name = $"c-{Guid.NewGuid():N}", CreatedBy = Owner, CreatedAt = DateTime.UtcNow, IsPublic = true };
        DbContext.Collections.Add(collection);
        return collection;
    }

    private void AddItems(Collection collection, int count)
    {
        for (int i = 0; i < count; i++)
        {
            Item item = new()
            {
                Id = Guid.NewGuid(),
                Question = $"Q-{Guid.NewGuid():N}",
                CorrectAnswer = "A",
                FuzzySignature = Guid.NewGuid().ToString("N"),
                FuzzyBucket = 1,
                CreatedBy = Owner,
                CreatedAt = DateTime.UtcNow
            };
            DbContext.Items.Add(item);
            DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item.Id, AddedAt = DateTime.UtcNow });
        }
    }

    private async Task<(IReadOnlyList<string> Commands, GetItems.Response Response)> ReadAsync(Collection root, string viewer = Owner)
    {
        int before = _sql.Commands.Count;
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(
            new GetItems.QueryRequest(Category: null, IsPrivate: null, Keywords: null, CollectionId: root.Id, IsRandom: null, Page: 1, PageSize: 50),
            DbContext,
            FakeUserContext.User(viewer),
            CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        return (_sql.Commands.Skip(before).ToList(), result.Value);
    }

    private static bool TouchesStructure(string command) =>
        command.Contains("CollectionCollectionMembers") || command.Contains("CollectionKeywordMembers");

    [Fact]
    public async Task GetItemsByCollectionId_NestedCommandCountAndShape_DoNotDependOnCollectionSize()
    {
        Collection small = await SeedAsync(rootItems: 2, nestedItems: 1);
        Collection large = await SeedAsync(rootItems: 100, nestedItems: 500);

        IReadOnlyList<string> smallCommands = (await ReadAsync(small)).Commands;
        IReadOnlyList<string> largeCommands = (await ReadAsync(large)).Commands;

        // Nested: structure check, root load, count, page, per-page collection lookup, incomplete reason.
        smallCommands.Should().HaveCount(6);
        largeCommands.Should().HaveCount(6);
        // The per-page lookup of the collections each listed item belongs to (bounded by the page size) is not membership resolution.
        foreach (string command in smallCommands.Concat(largeCommands).Where(c => c.Contains("CollectionCollectionMembers")))
        {
            Regex.IsMatch(command, @"IN \(@", RegexOptions.IgnoreCase).Should().BeFalse("membership is a subquery, never an id list: {0}", command);
        }

        // The count and the page each carry the whole resolution as a subquery.
        smallCommands.Count(c => c.Contains("CollectionCollectionMembers") && c.Contains("CollectionItems")).Should().BeGreaterThanOrEqualTo(2);
    }

    [Fact]
    public async Task GetItemsByCollectionId_FlatRoot_TakesTheFastPath_AndReturnsTheDirectItems()
    {
        Collection flat = NewCollection();
        AddItems(flat, 600);
        await DbContext.SaveChangesAsync();
        List<Guid> expected = await DbContext.CollectionItems.Where(ci => ci.CollectionId == flat.Id).Select(ci => ci.ItemId).ToListAsync();

        (IReadOnlyList<string> commands, GetItems.Response response) = await ReadAsync(flat);

        // Structure check, root load, count, page, per-page collection lookup: no walk, no budget, no incomplete-reason query.
        commands.Should().HaveCount(5);
        response.TotalCount.Should().Be(600);
        response.Incomplete.Should().BeFalse();
        response.IncompleteReason.Should().BeNull();
        response.Items.Select(i => Guid.Parse(i.Id)).Should().OnlyContain(id => expected.Contains(id));
        // Only the structure check reads the nested-link and topic tables; the count and the page do not.
        commands.Count(TouchesStructure).Should().Be(1);
    }

    [Fact]
    public async Task GetItemsByCollectionId_RootWithOnlyAHiddenChildLink_TakesTheFullPath_AndReturnsOnlyDirectItems()
    {
        Collection root = NewCollection();
        Collection hidden = new() { Id = Guid.NewGuid(), Name = "h", CreatedBy = "someone-else", CreatedAt = DateTime.UtcNow, IsPublic = false };
        DbContext.Collections.Add(hidden);
        DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = root.Id, ChildId = hidden.Id });
        AddItems(root, 2);
        AddItems(hidden, 3);
        await DbContext.SaveChangesAsync();

        (IReadOnlyList<string> commands, GetItems.Response response) = await ReadAsync(root, viewer: "viewer");

        commands.Should().HaveCount(6, "a hidden link still counts as structure");
        response.TotalCount.Should().Be(2);
        response.IncompleteReason.Should().BeNull();
    }

    [Fact]
    public async Task GetItemsByCollectionId_RootWith501HiddenLinks_IsMembershipRowLimit()
    {
        Collection root = NewCollection();
        for (int i = 0; i < 501; i++)
        {
            Collection hidden = new() { Id = Guid.NewGuid(), Name = $"h{i}", CreatedBy = "someone-else", CreatedAt = DateTime.UtcNow, IsPublic = false };
            DbContext.Collections.Add(hidden);
            DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = root.Id, ChildId = hidden.Id });
        }

        AddItems(root, 2);
        await DbContext.SaveChangesAsync();

        (_, GetItems.Response response) = await ReadAsync(root, viewer: "viewer");

        response.Incomplete.Should().BeTrue();
        response.IncompleteReason.Should().Be("MembershipRowLimit");
        response.TotalCount.Should().Be(2);
    }

    [Fact]
    public async Task GetItemsByCollectionId_RootWithOnlyTopicRows_TakesTheFullPath()
    {
        Collection root = NewCollection();
        DbContext.CollectionKeywordMembers.Add(new CollectionKeywordMember
        {
            Id = Guid.NewGuid(), ParentId = root.Id, CategoryId = Guid.NewGuid(), Keyword1Id = Guid.NewGuid()
        });
        AddItems(root, 2);
        await DbContext.SaveChangesAsync();

        (IReadOnlyList<string> commands, GetItems.Response response) = await ReadAsync(root);

        commands.Should().HaveCount(6);
        response.TotalCount.Should().Be(2);
        response.IncompleteReason.Should().BeNull();
    }
}
