using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>
/// #285: adding an item to a collection must not bypass GET /items/{id} visibility. A caller may add an item only if it
/// is public, their own, or published by its creator through one of the creator's own public collections. No admin exception.
/// </summary>
public sealed class CollectionItemsVisibilityHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;
    private string _creatorId = null!;
    private string _callerId = null!;
    private string _thirdId = null!;
    private string _adminId = null!;
    private Category _category = null!;
    private Guid _callerCollectionId;
    private Guid _adminCollectionId;

    public async Task InitializeAsync()
    {
        _creatorId = SeedUser("creator");
        _callerId = SeedUser("caller");
        _thirdId = SeedUser("third");
        _adminId = SeedUser("admin");
        _category = VisibilitySeed.AddCategory(DbContext);
        _callerCollectionId = VisibilitySeed.AddCollection(DbContext, _callerId, false).Id;
        _adminCollectionId = VisibilitySeed.AddCollection(DbContext, _adminId, false).Id;
        await DbContext.SaveChangesAsync();

        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services => new CollectionItems.FeatureRegistration().AddToServiceCollection(services, new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build()),
            app => new CollectionItems.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private string SeedUser(string subject)
    {
        Guid id = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = id, Subject = subject, Email = $"{subject}@example.com", Name = subject });
        return id.ToString();
    }

    private Item PrivateItemOfCreator()
    {
        return VisibilitySeed.AddItem(DbContext, _category, _creatorId, true);
    }

    private async Task<HttpStatusCode> AddAsync(Guid collectionId, Guid itemId, string subject = "caller")
    {
        string token = _host.CreateToken(subject, $"{subject}@example.com", subject == "admin" ? AdminGroups : null);
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Post, $"/collections/{collectionId}/items", token, JsonContent.Create(new { itemId }));
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return response.StatusCode;
    }

    private async Task<bool> RowExistsAsync(Guid collectionId, Guid itemId)
    {
        await using var db = CreateDbContext();
        return await db.CollectionItems.AnyAsync(ci => ci.CollectionId == collectionId && ci.ItemId == itemId);
    }

    [Fact]
    public async Task AnothersPrivateItem_Returns404_AndNoRow()
    {
        Item item = PrivateItemOfCreator();
        await DbContext.SaveChangesAsync();

        (await AddAsync(_callerCollectionId, item.Id)).Should().Be(HttpStatusCode.NotFound);
        (await RowExistsAsync(_callerCollectionId, item.Id)).Should().BeFalse();
    }

    [Fact]
    public async Task OwnPrivateItem_Returns201()
    {
        Item item = VisibilitySeed.AddItem(DbContext, _category, _callerId, true);
        await DbContext.SaveChangesAsync();

        (await AddAsync(_callerCollectionId, item.Id)).Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task PublicItem_Returns201()
    {
        Item item = VisibilitySeed.AddItem(DbContext, _category, _creatorId, false);
        await DbContext.SaveChangesAsync();

        (await AddAsync(_callerCollectionId, item.Id)).Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task PrivateItemInCreatorsPublicCollection_Returns201()
    {
        Item item = PrivateItemOfCreator();
        Collection published = VisibilitySeed.AddCollection(DbContext, _creatorId, true);
        VisibilitySeed.Link(DbContext, published, item);
        await DbContext.SaveChangesAsync();

        (await AddAsync(_callerCollectionId, item.Id)).Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task PrivateItemOnlyInThirdUsersPublicCollection_Returns404()
    {
        Item item = PrivateItemOfCreator();
        Collection thirdPublic = VisibilitySeed.AddCollection(DbContext, _thirdId, true);
        VisibilitySeed.Link(DbContext, thirdPublic, item);
        await DbContext.SaveChangesAsync();

        (await AddAsync(_callerCollectionId, item.Id)).Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task PrivateItemOnlyInCallersOwnCollection_CannotBeAddedElsewhere()
    {
        Item item = PrivateItemOfCreator();
        VisibilitySeed.Link(DbContext, VisibilitySeed.AddCollection(DbContext, _callerId, true), item);
        Collection second = VisibilitySeed.AddCollection(DbContext, _callerId, false);
        await DbContext.SaveChangesAsync();

        (await AddAsync(second.Id, item.Id)).Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task PrivateItemOnlyInCreatorsPrivateCollection_Returns404()
    {
        Item item = PrivateItemOfCreator();
        VisibilitySeed.Link(DbContext, VisibilitySeed.AddCollection(DbContext, _creatorId, false), item);
        await DbContext.SaveChangesAsync();

        (await AddAsync(_callerCollectionId, item.Id)).Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task AlreadyInCallersCollection_ButNotReachable_StillReturns404()
    {
        // Reachability is checked before the idempotent "already in collection" short-circuit.
        Item item = PrivateItemOfCreator();
        VisibilitySeed.Link(DbContext, new Collection { Id = _callerCollectionId }, item);
        await DbContext.SaveChangesAsync();

        (await AddAsync(_callerCollectionId, item.Id)).Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task AdminNonOwner_CannotAddAnothersPrivateItem()
    {
        Item item = PrivateItemOfCreator();
        await DbContext.SaveChangesAsync();

        (await AddAsync(_adminCollectionId, item.Id, "admin")).Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Bulk_SkipsDeniedItems_AndCountsThemAsSkipped()
    {
        Item denied = PrivateItemOfCreator();
        Item allowed = VisibilitySeed.AddItem(DbContext, _category, _creatorId, false);
        await DbContext.SaveChangesAsync();

        string token = _host.CreateToken("caller", "caller@example.com");
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Post,
            $"/collections/{_callerCollectionId}/items/bulk",
            token,
            JsonContent.Create(new { itemIds = new[] { denied.Id, allowed.Id } }));
        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("addedCount").GetInt32().Should().Be(1);
        body.RootElement.GetProperty("skippedCount").GetInt32().Should().Be(1);
        body.RootElement.GetProperty("addedItemIds").EnumerateArray().Select(e => e.GetString())
            .Should().BeEquivalentTo(new[] { allowed.Id.ToString() });
        (await RowExistsAsync(_callerCollectionId, denied.Id)).Should().BeFalse();
    }
}
