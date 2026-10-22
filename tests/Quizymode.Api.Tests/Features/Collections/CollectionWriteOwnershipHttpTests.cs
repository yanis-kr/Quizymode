using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>
/// #289: collection write endpoints (and the owner-only bookmarkers list) are owner-only. A non-owner who cannot see the
/// collection gets the same 404 as a missing id; a non-owner who can see it (public) gets 403. Admins are non-owners.
/// </summary>
public sealed class CollectionWriteOwnershipHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private const string Forbidden403Title = "Forbidden";
    private const string ModifyDetail = "Only the collection owner can add or remove items.";

    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;
    private Guid _ownerId;
    private Guid _otherId;
    private Guid _adminId;
    private Category _category = null!;
    private Item _linkedItem = null!;
    private Item _extraItem = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                IConfiguration configuration = new ConfigurationBuilder().Build();
                new UpdateCollection.FeatureRegistration().AddToServiceCollection(services, configuration);
                new CollectionItems.FeatureRegistration().AddToServiceCollection(services, configuration);
            },
            app =>
            {
                new UpdateCollection.Endpoint().MapEndpoint(app);
                new DeleteCollection.Endpoint().MapEndpoint(app);
                new CollectionItems.Endpoint().MapEndpoint(app);
                new GetCollectionBookmarks.Endpoint().MapEndpoint(app);
                new BookmarkCollection.Endpoint().MapEndpoint(app);
                new UnbookmarkCollection.Endpoint().MapEndpoint(app);
            });

        _ownerId = Guid.NewGuid();
        _otherId = Guid.NewGuid();
        _adminId = Guid.NewGuid();
        DbContext.Users.AddRange(
            new User { Id = _ownerId, Subject = "owner-sub", Email = "owner@example.com", Name = "owner" },
            new User { Id = _otherId, Subject = "other-sub", Email = "other@example.com", Name = "other" },
            new User { Id = _adminId, Subject = "admin-sub", Email = "admin@example.com", Name = "admin" });
        _category = VisibilitySeed.AddCategory(DbContext);
        _linkedItem = VisibilitySeed.AddItem(DbContext, _category, _ownerId.ToString(), false);
        _extraItem = VisibilitySeed.AddItem(DbContext, _category, _ownerId.ToString(), false);
        await DbContext.SaveChangesAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    public static TheoryData<string> Kinds => new() { "update", "delete", "add", "bulk", "remove", "bookmarkers" };

    public static TheoryData<string> BodyKinds => new() { "update", "add", "bulk" };

    private string OwnerToken => _host.CreateToken("owner-sub", "owner@example.com");

    private string OtherToken => _host.CreateToken("other-sub", "other@example.com");

    private string AdminToken => _host.CreateToken("admin-sub", "admin@example.com", AdminGroups);

    private async Task<Collection> SeedCollectionAsync(bool isPublic)
    {
        Collection collection = VisibilitySeed.AddCollection(DbContext, _ownerId.ToString(), isPublic);
        collection.Description = "Original description";
        collection.IsDiscoverable = isPublic;
        VisibilitySeed.Link(DbContext, collection, _linkedItem);
        DbContext.CollectionBookmarks.Add(new CollectionBookmark
        {
            Id = Guid.NewGuid(),
            UserId = Guid.NewGuid().ToString(),
            CollectionId = collection.Id
        });
        DbContext.CollectionShares.Add(new CollectionShare
        {
            Id = Guid.NewGuid(),
            CollectionId = collection.Id,
            SharedBy = _ownerId.ToString(),
            SharedWithEmail = "friend@example.com"
        });
        await DbContext.SaveChangesAsync();
        return collection;
    }

    private static (HttpMethod Method, string Path, string? Json) Build(string kind, Guid collectionId, bool invalidBody, Item extraItem, Item linkedItem)
    {
        return kind switch
        {
            "update" => (HttpMethod.Put, $"/collections/{collectionId}",
                invalidBody ? "{\"name\":\"\"}" : "{\"name\":\"Renamed\",\"description\":\"New description\",\"isPublic\":false}"),
            "delete" => (HttpMethod.Delete, $"/collections/{collectionId}", null),
            "add" => (HttpMethod.Post, $"/collections/{collectionId}/items",
                invalidBody ? $"{{\"itemId\":\"{Guid.Empty}\"}}" : $"{{\"itemId\":\"{extraItem.Id}\"}}"),
            "bulk" => (HttpMethod.Post, $"/collections/{collectionId}/items/bulk",
                invalidBody ? "{\"itemIds\":[]}" : $"{{\"itemIds\":[\"{extraItem.Id}\"]}}"),
            "remove" => (HttpMethod.Delete, $"/collections/{collectionId}/items/{linkedItem.Id}", null),
            "bookmarkers" => (HttpMethod.Get, $"/collections/{collectionId}/bookmarks", null),
            _ => throw new ArgumentOutOfRangeException(nameof(kind))
        };
    }

    private async Task<HttpResponseMessage> SendAsync(string kind, Guid collectionId, string? token, bool invalidBody = false)
    {
        (HttpMethod method, string path, string? json) = Build(kind, collectionId, invalidBody, _extraItem, _linkedItem);
        using StringContent? content = json is null ? null : new StringContent(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path, token, content);
        return await _host.Client.SendAsync(request);
    }

    private async Task<HttpResponseMessage> SendRawAsync(HttpMethod method, string path, string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path, token);
        return await _host.Client.SendAsync(request);
    }

    private sealed record Snapshot(
        bool Exists, string? Name, string? Description, bool IsPublic, bool IsDiscoverable, DateTime? UpdatedAt,
        int Items, int Bookmarks, int Shares);

    private async Task<Snapshot> SnapshotAsync(Guid collectionId)
    {
        await using ApplicationDbContext db = CreateDbContext();
        Collection? c = await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == collectionId);
        return new Snapshot(
            c is not null, c?.Name, c?.Description, c?.IsPublic ?? false, c?.IsDiscoverable ?? false, c?.UpdatedAt,
            await db.CollectionItems.CountAsync(x => x.CollectionId == collectionId),
            await db.CollectionBookmarks.CountAsync(x => x.CollectionId == collectionId),
            await db.CollectionShares.CountAsync(x => x.CollectionId == collectionId));
    }

    private static async Task AssertIdenticalNotFoundAsync(HttpResponseMessage denied, HttpResponseMessage missing)
    {
        denied.StatusCode.Should().Be(HttpStatusCode.NotFound);
        missing.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await denied.Content.ReadAsStringAsync()).Should().Be(await missing.Content.ReadAsStringAsync());
        denied.Content.Headers.ContentType?.ToString().Should().Be(missing.Content.Headers.ContentType?.ToString());
        denied.Content.Headers.ContentLength.Should().Be(missing.Content.Headers.ContentLength);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Owner_Succeeds_AndChangePersists(string kind)
    {
        Collection collection = await SeedCollectionAsync(isPublic: false);

        using HttpResponseMessage response = await SendAsync(kind, collection.Id, OwnerToken);

        HttpStatusCode expected = kind switch
        {
            "delete" or "remove" => HttpStatusCode.NoContent,
            "add" => HttpStatusCode.Created,
            _ => HttpStatusCode.OK
        };
        response.StatusCode.Should().Be(expected);
        Snapshot after = await SnapshotAsync(collection.Id);
        switch (kind)
        {
            case "update":
                after.Name.Should().Be("Renamed");
                after.Description.Should().Be("New description");
                break;
            case "delete":
                after.Exists.Should().BeFalse();
                after.Items.Should().Be(0);
                after.Bookmarks.Should().Be(0);
                after.Shares.Should().Be(0);
                break;
            case "add":
            case "bulk":
                after.Items.Should().Be(2);
                break;
            case "remove":
                after.Items.Should().Be(0);
                break;
            default:
                using (JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()))
                {
                    body.RootElement.GetProperty("bookmarkedBy").GetArrayLength().Should().Be(1);
                }

                break;
        }
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task OtherUser_OnPrivateCollection_Returns404IdenticalToMissingId_AndChangesNothing(string kind)
    {
        Collection collection = await SeedCollectionAsync(isPublic: false);
        Snapshot before = await SnapshotAsync(collection.Id);

        using HttpResponseMessage denied = await SendAsync(kind, collection.Id, OtherToken);
        using HttpResponseMessage missing = await SendAsync(kind, Guid.NewGuid(), OtherToken);

        await AssertIdenticalNotFoundAsync(denied, missing);
        (await SnapshotAsync(collection.Id)).Should().Be(before);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Admin_NotOwner_OnPrivateCollection_Returns404IdenticalToMissingId_AndChangesNothing(string kind)
    {
        Collection collection = await SeedCollectionAsync(isPublic: false);
        Snapshot before = await SnapshotAsync(collection.Id);

        using HttpResponseMessage denied = await SendAsync(kind, collection.Id, AdminToken);
        using HttpResponseMessage missing = await SendAsync(kind, Guid.NewGuid(), AdminToken);

        await AssertIdenticalNotFoundAsync(denied, missing);
        (await SnapshotAsync(collection.Id)).Should().Be(before);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task OtherUser_OnPublicCollection_Returns403Forbidden_AndChangesNothing(string kind)
    {
        Collection collection = await SeedCollectionAsync(isPublic: true);
        Snapshot before = await SnapshotAsync(collection.Id);

        using HttpResponseMessage response = await SendAsync(kind, collection.Id, OtherToken);

        await AssertForbiddenAsync(kind, response);
        (await SnapshotAsync(collection.Id)).Should().Be(before);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Admin_NotOwner_OnPublicCollection_Returns403Forbidden_AndChangesNothing(string kind)
    {
        Collection collection = await SeedCollectionAsync(isPublic: true);
        Snapshot before = await SnapshotAsync(collection.Id);

        using HttpResponseMessage response = await SendAsync(kind, collection.Id, AdminToken);

        await AssertForbiddenAsync(kind, response);
        (await SnapshotAsync(collection.Id)).Should().Be(before);
    }

    private static async Task AssertForbiddenAsync(string kind, HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("title").GetString().Should().Be(Forbidden403Title);
        string expectedDetail = kind switch
        {
            "update" => "You can only update your own collections.",
            "delete" => "You can only delete your own collections.",
            "bookmarkers" => "Only the collection owner can see who bookmarked it.",
            _ => ModifyDetail
        };
        body.RootElement.GetProperty("detail").GetString().Should().Be(expectedDetail);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Anonymous_Returns401_AndChangesNothing(string kind)
    {
        Collection collection = await SeedCollectionAsync(isPublic: true);
        Snapshot before = await SnapshotAsync(collection.Id);

        using HttpResponseMessage response = await SendAsync(kind, collection.Id, token: null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await SnapshotAsync(collection.Id)).Should().Be(before);
    }

    [Theory]
    [MemberData(nameof(BodyKinds))]
    public async Task Anonymous_WithInvalidBody_Returns401Not400(string kind)
    {
        Collection collection = await SeedCollectionAsync(isPublic: true);

        using HttpResponseMessage response = await SendAsync(kind, collection.Id, token: null, invalidBody: true);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [MemberData(nameof(BodyKinds))]
    public async Task OtherUser_WithInvalidBody_Returns400BeforeOwnershipCheck(string kind)
    {
        Collection privateCollection = await SeedCollectionAsync(isPublic: false);
        Collection publicCollection = await SeedCollectionAsync(isPublic: true);

        using HttpResponseMessage onPrivate = await SendAsync(kind, privateCollection.Id, OtherToken, invalidBody: true);
        using HttpResponseMessage onPublic = await SendAsync(kind, publicCollection.Id, OtherToken, invalidBody: true);

        onPrivate.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        onPublic.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task Owner_WithExpiredToken_Returns401(string kind)
    {
        Collection collection = await SeedCollectionAsync(isPublic: false);
        string expired = _host.CreateToken("owner-sub", "owner@example.com", expiresUtc: DateTime.UtcNow.AddMinutes(-30));
        Snapshot before = await SnapshotAsync(collection.Id);

        using HttpResponseMessage response = await SendAsync(kind, collection.Id, expired);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await SnapshotAsync(collection.Id)).Should().Be(before);
    }

    [Fact]
    public async Task Bulk_OtherUser_OnPublicCollection_WithAllUnknownIds_Returns403()
    {
        Collection collection = await SeedCollectionAsync(isPublic: true);

        using StringContent content = new(
            $"{{\"itemIds\":[\"{Guid.NewGuid()}\",\"{Guid.NewGuid()}\"]}}", Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Post, $"/collections/{collection.Id}/items/bulk", OtherToken, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Add_OtherUser_OnPublicCollection_WithMissingItem_Returns403()
    {
        Collection collection = await SeedCollectionAsync(isPublic: true);

        using StringContent content = new($"{{\"itemId\":\"{Guid.NewGuid()}\"}}", Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Post, $"/collections/{collection.Id}/items", OtherToken, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData("update")]
    [InlineData("delete")]
    public async Task NotAGuid_Returns400(string kind)
    {
        HttpMethod method = kind == "delete" ? HttpMethod.Delete : HttpMethod.Put;
        using StringContent? content = kind == "update"
            ? new StringContent("{\"name\":\"Renamed\"}", Encoding.UTF8, "application/json")
            : null;
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, "/collections/not-a-guid", OwnerToken, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("POST", "/collections/not-a-guid/items")]
    [InlineData("POST", "/collections/not-a-guid/items/bulk")]
    [InlineData("DELETE", "/collections/not-a-guid/items/not-a-guid")]
    [InlineData("GET", "/collections/not-a-guid/bookmarks")]
    [InlineData("POST", "/collections/not-a-guid/bookmark")]
    public async Task GuidConstrainedRoutes_WithNotAGuid_AreRouteMisses404(string method, string path)
    {
        using HttpResponseMessage response = await SendRawAsync(new HttpMethod(method), path, OwnerToken);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Bookmark_OtherUser_OnPrivateCollection_Returns404IdenticalToMissingId_AndWritesNoRow()
    {
        Collection collection = await SeedCollectionAsync(isPublic: false);
        int bookmarksBefore = (await SnapshotAsync(collection.Id)).Bookmarks;

        using HttpResponseMessage denied = await SendRawAsync(HttpMethod.Post, $"/collections/{collection.Id}/bookmark", OtherToken);
        using HttpResponseMessage missing = await SendRawAsync(HttpMethod.Post, $"/collections/{Guid.NewGuid()}/bookmark", OtherToken);

        await AssertIdenticalNotFoundAsync(denied, missing);
        (await SnapshotAsync(collection.Id)).Bookmarks.Should().Be(bookmarksBefore);
        await using ApplicationDbContext db = CreateDbContext();
        (await db.CollectionBookmarks.AnyAsync(b => b.UserId == _otherId.ToString())).Should().BeFalse();
    }

    [Fact]
    public async Task Bookmark_AdminNotOwner_OnPrivateCollection_Returns404IdenticalToMissingId_AndWritesNoRow()
    {
        Collection collection = await SeedCollectionAsync(isPublic: false);

        using HttpResponseMessage denied = await SendRawAsync(HttpMethod.Post, $"/collections/{collection.Id}/bookmark", AdminToken);
        using HttpResponseMessage missing = await SendRawAsync(HttpMethod.Post, $"/collections/{Guid.NewGuid()}/bookmark", AdminToken);

        await AssertIdenticalNotFoundAsync(denied, missing);
        await using ApplicationDbContext db = CreateDbContext();
        (await db.CollectionBookmarks.AnyAsync(b => b.UserId == _adminId.ToString())).Should().BeFalse();
    }

    [Fact]
    public async Task Bookmark_OtherUser_OnPublicCollection_Returns204_AndWritesRow()
    {
        Collection collection = await SeedCollectionAsync(isPublic: true);

        using HttpResponseMessage response = await SendRawAsync(HttpMethod.Post, $"/collections/{collection.Id}/bookmark", OtherToken);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        await using ApplicationDbContext db = CreateDbContext();
        (await db.CollectionBookmarks.AnyAsync(b => b.CollectionId == collection.Id && b.UserId == _otherId.ToString())).Should().BeTrue();
    }

    [Fact]
    public async Task Bookmark_Owner_OnPrivateCollection_Returns204()
    {
        Collection collection = await SeedCollectionAsync(isPublic: false);

        using HttpResponseMessage response = await SendRawAsync(HttpMethod.Post, $"/collections/{collection.Id}/bookmark", OwnerToken);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Bookmark_Anonymous_Returns401_AndWritesNoRow()
    {
        Collection collection = await SeedCollectionAsync(isPublic: true);
        int bookmarksBefore = (await SnapshotAsync(collection.Id)).Bookmarks;

        using HttpResponseMessage response = await SendRawAsync(HttpMethod.Post, $"/collections/{collection.Id}/bookmark", token: null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await SnapshotAsync(collection.Id)).Bookmarks.Should().Be(bookmarksBefore);
    }

    [Fact]
    public async Task Unbookmark_PreSeededRowOnOthersPrivateCollection_Returns204_AndRowIsGone()
    {
        Collection collection = await SeedCollectionAsync(isPublic: false);
        DbContext.CollectionBookmarks.Add(new CollectionBookmark
        {
            Id = Guid.NewGuid(),
            UserId = _otherId.ToString(),
            CollectionId = collection.Id
        });
        await DbContext.SaveChangesAsync();

        using HttpResponseMessage response = await SendRawAsync(HttpMethod.Delete, $"/collections/{collection.Id}/bookmark", OtherToken);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        await using ApplicationDbContext db = CreateDbContext();
        (await db.CollectionBookmarks.AnyAsync(b => b.CollectionId == collection.Id && b.UserId == _otherId.ToString())).Should().BeFalse();
    }
}
