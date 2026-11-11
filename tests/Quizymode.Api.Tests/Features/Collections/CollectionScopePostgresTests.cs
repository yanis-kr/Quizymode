using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using GetItemsHandler = Quizymode.Api.Features.Items.Get.GetItemsHandler;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>
/// #551: the per-collection row budget translates and returns the same rows on PostgreSQL as on SQLite (behavior only, no SQL text
/// assertions). Requires Docker.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class CollectionScopePostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private const string Owner = "owner-user";
    private static readonly DateTime Start = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static List<Guid> AddItems(ApplicationDbContext db, Category category, Collection collection, int count)
    {
        List<Guid> ids = [];
        for (int i = 0; i < count; i++)
        {
            Item item = VisibilitySeed.AddItem(db, category, Owner, isPrivate: false);
            db.CollectionItems.Add(new CollectionItem
            {
                Id = Guid.NewGuid(),
                CollectionId = collection.Id,
                ItemId = item.Id,
                AddedAt = Start.AddSeconds(ids.Count)
            });
            ids.Add(item.Id);
        }

        return ids;
    }

    [SkippableFact]
    public async Task RowCap_TranslatesOnPostgres_SameResultAsSqlite()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        Guid rootId;
        List<Guid> expected;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            Collection root = VisibilitySeed.AddCollection(db, Owner, isPublic: true);
            Collection child = VisibilitySeed.AddCollection(db, Owner, isPublic: true);
            db.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = root.Id, ChildId = child.Id, AddedAt = Start });
            List<Guid> rootItems = AddItems(db, category, root, 3);
            List<Guid> childItems = AddItems(db, category, child, 600);
            await db.SaveChangesAsync();
            rootId = root.Id;
            expected = rootItems.Concat(childItems.Take(500)).ToList();
        }

        await using ApplicationDbContext read = fixture.CreateDbContext();
        List<Guid> roster = await CollectionScope.AccessibleMemberItemIds(read, rootId, Owner).ToListAsync();
        string? reason = await CollectionScope.IncompleteReasonAsync(read, rootId, Owner, CancellationToken.None);
        Dictionary<Guid, CollectionCardCounts.Counts> counts =
            await CollectionCardCounts.ForCollectionsAsync(read, [rootId], Owner, CancellationToken.None);
        Result<GetItems.Response> page = await GetItemsHandler.HandleAsync(
            new GetItems.QueryRequest(Category: null, IsPrivate: null, Keywords: null, CollectionId: rootId, IsRandom: null, Page: 1, PageSize: 50),
            read,
            FakeUserContext.User(Owner),
            CancellationToken.None);

        roster.Should().BeEquivalentTo(expected);
        reason.Should().Be(CollectionScope.MembershipRowLimitReason);
        counts[rootId].ItemCount.Should().Be(503, "the card count equals the roster under the row cap");
        page.IsSuccess.Should().BeTrue();
        page.Value.TotalCount.Should().Be(503);
        page.Value.IncompleteReason.Should().Be(CollectionScope.MembershipRowLimitReason);
    }

    [SkippableFact]
    public async Task RowBudget_TopicRowsRankFirst_ItemsFillTheRest_OnPostgres()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        Guid rootId;
        List<Guid> expected;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            Collection root = VisibilitySeed.AddCollection(db, Owner, isPublic: true);
            Collection child = VisibilitySeed.AddCollection(db, Owner, isPublic: true);
            db.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = root.Id, ChildId = child.Id, AddedAt = Start });
            for (int i = 0; i < 300; i++)
            {
                db.CollectionKeywordMembers.Add(new CollectionKeywordMember
                {
                    Id = Guid.NewGuid(), ParentId = child.Id, CategoryId = Guid.NewGuid(), Keyword1Id = Guid.NewGuid(), AddedAt = Start.AddSeconds(i)
                });
            }

            List<Guid> childItems = AddItems(db, category, child, 300);
            await db.SaveChangesAsync();
            rootId = root.Id;
            expected = childItems.Take(200).ToList();
        }

        await using ApplicationDbContext read = fixture.CreateDbContext();
        (await CollectionScope.AccessibleMemberItemIds(read, rootId, Owner).ToListAsync()).Should().BeEquivalentTo(expected);
        (await CollectionScope.IncompleteReasonAsync(read, rootId, Owner, CancellationToken.None)).Should().Be(CollectionScope.MembershipRowLimitReason);
        (await CollectionCardCounts.ForCollectionsAsync(read, [rootId], Owner, CancellationToken.None))[rootId].ItemCount.Should().Be(200);
    }

    [SkippableFact]
    public async Task RowBudget_RowsSharingOneAddedAt_AreCutByIdTieBreak_OnPostgres()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        Guid rootId;
        List<Guid> expected;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            Collection root = VisibilitySeed.AddCollection(db, Owner, isPublic: true);
            Collection child = VisibilitySeed.AddCollection(db, Owner, isPublic: true);
            db.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = root.Id, ChildId = child.Id, AddedAt = Start });
            List<(Guid RowId, Guid ItemId)> rows = [];
            for (int i = 0; i < 501; i++)
            {
                Item item = VisibilitySeed.AddItem(db, category, Owner, isPrivate: false);
                CollectionItem row = new() { Id = Guid.NewGuid(), CollectionId = child.Id, ItemId = item.Id, AddedAt = Start };
                db.CollectionItems.Add(row);
                rows.Add((row.Id, item.Id));
            }

            await db.SaveChangesAsync();
            rootId = root.Id;
            // Ties on AddedAt break by the membership row id; PostgreSQL orders uuids bytewise, which is the ordinal order of their text.
            expected = rows.OrderBy(r => r.RowId.ToString(), StringComparer.Ordinal).Take(500).Select(r => r.ItemId).ToList();
        }

        await using ApplicationDbContext read = fixture.CreateDbContext();
        List<Guid> roster = await CollectionScope.AccessibleMemberItemIds(read, rootId, Owner).ToListAsync();
        Dictionary<Guid, CollectionCardCounts.Counts> counts =
            await CollectionCardCounts.ForCollectionsAsync(read, [rootId], Owner, CancellationToken.None);

        roster.Should().BeEquivalentTo(expected);
        counts[rootId].ItemCount.Should().Be(roster.Count).And.Be(500);
    }
}
