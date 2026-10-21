using FluentAssertions;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Features.Items.GetById;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.GetById;

/// <summary>
/// #285: runs the visibility expressions (GetItemById filter, GET /comments subquery, collection-add reachability)
/// through the Npgsql provider so a translation failure cannot hide behind SQLite. Requires Docker.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class ItemVisibilityPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private void RequireDatabase() => Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

    [SkippableFact]
    public async Task GetItemById_FiltersPrivateItemsOfOthers()
    {
        RequireDatabase();
        string owner = Guid.NewGuid().ToString();
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Category category = VisibilitySeed.AddCategory(db);
        Item item = VisibilitySeed.AddItem(db, category, owner, true);
        await db.SaveChangesAsync();

        (await GetItemById.HandleAsync(item.Id.ToString(), db, new FakeUserContext(true, owner), CancellationToken.None))
            .IsSuccess.Should().BeTrue();
        (await GetItemById.HandleAsync(item.Id.ToString(), db, FakeUserContext.Admin(), CancellationToken.None))
            .IsSuccess.Should().BeTrue();
        Result<GetItemById.Response> other = await GetItemById.HandleAsync(
            item.Id.ToString(), db, FakeUserContext.User(Guid.NewGuid().ToString()), CancellationToken.None);
        other.Error.Type.Should().Be(ErrorType.NotFound);
        Result<GetItemById.Response> anonymous = await GetItemById.HandleAsync(
            item.Id.ToString(), db, FakeUserContext.Anonymous, CancellationToken.None);
        anonymous.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [SkippableFact]
    public async Task GetComments_WithoutItemId_UsesAccessibleItemsSubquery()
    {
        RequireDatabase();
        string owner = Guid.NewGuid().ToString();
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Category category = VisibilitySeed.AddCategory(db);
        Item publicItem = VisibilitySeed.AddItem(db, category, owner, false);
        Item privateItem = VisibilitySeed.AddItem(db, category, owner, true);
        VisibilitySeed.AddComment(db, publicItem);
        VisibilitySeed.AddComment(db, privateItem);
        await db.SaveChangesAsync();

        HashSet<Guid> anonymous = await CommentItemIdsAsync(db, FakeUserContext.Anonymous);
        anonymous.Should().Contain(publicItem.Id).And.NotContain(privateItem.Id);
        HashSet<Guid> ownerView = await CommentItemIdsAsync(db, FakeUserContext.User(owner));
        ownerView.Should().Contain(publicItem.Id).And.Contain(privateItem.Id);
        HashSet<Guid> admin = await CommentItemIdsAsync(db, FakeUserContext.Admin());
        admin.Should().Contain(publicItem.Id).And.Contain(privateItem.Id);
    }

    [SkippableFact]
    public async Task CollectionAdd_ReachabilityQuery_AppliesCreatorPublishedRule()
    {
        RequireDatabase();
        string creator = Guid.NewGuid().ToString();
        string caller = Guid.NewGuid().ToString();
        string third = Guid.NewGuid().ToString();
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Category category = VisibilitySeed.AddCategory(db);
        Item hidden = VisibilitySeed.AddItem(db, category, creator, true);
        Item publishedByCreator = VisibilitySeed.AddItem(db, category, creator, true);
        Item publishedByThird = VisibilitySeed.AddItem(db, category, creator, true);
        VisibilitySeed.Link(db, VisibilitySeed.AddCollection(db, creator, true), publishedByCreator);
        VisibilitySeed.Link(db, VisibilitySeed.AddCollection(db, third, true), publishedByThird);
        Collection target = VisibilitySeed.AddCollection(db, caller, false);
        await db.SaveChangesAsync();
        FakeUserContext user = FakeUserContext.User(caller);

        (await CollectionItems.HandleAddAsync(target.Id, new CollectionItems.AddRequest(hidden.Id), db, user, CancellationToken.None))
            .Error.Type.Should().Be(ErrorType.NotFound);
        (await CollectionItems.HandleAddAsync(target.Id, new CollectionItems.AddRequest(publishedByThird.Id), db, user, CancellationToken.None))
            .Error.Type.Should().Be(ErrorType.NotFound);
        (await CollectionItems.HandleAddAsync(target.Id, new CollectionItems.AddRequest(publishedByCreator.Id), db, user, CancellationToken.None))
            .IsSuccess.Should().BeTrue();

        Collection bulkTarget = VisibilitySeed.AddCollection(db, caller, false);
        await db.SaveChangesAsync();
        Result<CollectionItems.BulkAddResponse> bulk = await CollectionItems.HandleBulkAddAsync(
            bulkTarget.Id,
            new CollectionItems.BulkAddRequest([hidden.Id, publishedByThird.Id, publishedByCreator.Id]),
            db,
            user,
            CancellationToken.None);
        bulk.IsSuccess.Should().BeTrue();
        bulk.Value.AddedCount.Should().Be(1);
        bulk.Value.SkippedCount.Should().Be(2);
        bulk.Value.AddedItemIds.Should().BeEquivalentTo(new[] { publishedByCreator.Id.ToString() });
    }

    private static async Task<HashSet<Guid>> CommentItemIdsAsync(ApplicationDbContext db, FakeUserContext user)
    {
        Result<GetComments.Response> result = await GetComments.HandleAsync(
            new GetComments.QueryRequest(null), db, user, CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        return result.Value.Comments.Select(c => c.ItemId).ToHashSet();
    }
}
