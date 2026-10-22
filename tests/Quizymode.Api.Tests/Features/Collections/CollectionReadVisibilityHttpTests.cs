using System.Net;
using System.Text.Json;
using FluentAssertions;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>
/// #298: GET /collections/{id}/rating returns the same empty 404 as a missing id for collections the caller cannot access,
/// and GET /collections/bookmarks omits bookmarked collections that are no longer accessible. Admins are non-owners.
/// </summary>
public sealed class CollectionReadVisibilityHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;
    private Guid _ownerId;
    private Guid _otherId;
    private Guid _adminId;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            _ => { },
            app =>
            {
                new GetCollectionRating.Endpoint().MapEndpoint(app);
                new GetBookmarks.Endpoint().MapEndpoint(app);
            });
        _ownerId = Guid.NewGuid();
        _otherId = Guid.NewGuid();
        _adminId = Guid.NewGuid();
        DbContext.Users.AddRange(
            new User { Id = _ownerId, Subject = "owner-sub", Email = "owner@example.com", Name = "owner" },
            new User { Id = _otherId, Subject = "other-sub", Email = "other@example.com", Name = "other" },
            new User { Id = _adminId, Subject = "admin-sub", Email = "admin@example.com", Name = "admin" });
        await DbContext.SaveChangesAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private string OwnerToken => _host.CreateToken("owner-sub", "owner@example.com");

    private string OtherToken => _host.CreateToken("other-sub", "other@example.com");

    private string AdminToken => _host.CreateToken("admin-sub", "admin@example.com", AdminGroups);

    private async Task<Collection> SeedAsync(bool isPublic)
    {
        Collection collection = VisibilitySeed.AddCollection(DbContext, _ownerId.ToString(), isPublic);
        DbContext.CollectionRatings.Add(new CollectionRating
        {
            Id = Guid.NewGuid(),
            CollectionId = collection.Id,
            CreatedBy = _ownerId.ToString(),
            Stars = 4
        });
        await DbContext.SaveChangesAsync();
        return collection;
    }

    private async Task<HttpResponseMessage> GetAsync(string path, string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, path, token);
        return await _host.Client.SendAsync(request);
    }

    private static async Task AssertIdenticalNotFoundAsync(HttpResponseMessage denied, HttpResponseMessage missing)
    {
        denied.StatusCode.Should().Be(HttpStatusCode.NotFound);
        missing.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await denied.Content.ReadAsStringAsync()).Should().Be(await missing.Content.ReadAsStringAsync());
        denied.Content.Headers.ContentType?.ToString().Should().Be(missing.Content.Headers.ContentType?.ToString());
        denied.Content.Headers.ContentLength.Should().Be(missing.Content.Headers.ContentLength);
    }

    public static TheoryData<string> Callers => new() { "other", "admin", "anonymous" };

    private string? TokenFor(string caller) => caller switch
    {
        "other" => OtherToken,
        "admin" => AdminToken,
        _ => null
    };

    [Fact]
    public async Task Rating_Owner_OnPrivate_ReturnsOk()
    {
        Collection collection = await SeedAsync(isPublic: false);

        using HttpResponseMessage response = await GetAsync($"/collections/{collection.Id}/rating", OwnerToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("count").GetInt32().Should().Be(1);
        doc.RootElement.GetProperty("myStars").GetInt32().Should().Be(4);
    }

    [Theory]
    [InlineData("other")]
    [InlineData("admin")]
    [InlineData("anonymous")]
    public async Task Rating_Public_ReturnsOk_ForAnyCaller(string caller)
    {
        Collection collection = await SeedAsync(isPublic: true);

        using HttpResponseMessage response = await GetAsync($"/collections/{collection.Id}/rating", TokenFor(caller));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData("other")]
    [InlineData("admin")]
    [InlineData("anonymous")]
    public async Task Rating_Private_NonOwner_IsIdenticalToMissingId(string caller)
    {
        Collection collection = await SeedAsync(isPublic: false);

        using HttpResponseMessage denied = await GetAsync($"/collections/{collection.Id}/rating", TokenFor(caller));
        using HttpResponseMessage missing = await GetAsync($"/collections/{Guid.NewGuid()}/rating", TokenFor(caller));

        await AssertIdenticalNotFoundAsync(denied, missing);
    }

    private async Task BookmarkAsync(Collection collection, string userId)
    {
        DbContext.CollectionBookmarks.Add(new CollectionBookmark
        {
            Id = Guid.NewGuid(),
            CollectionId = collection.Id,
            UserId = userId,
            CreatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();
    }

    [Fact]
    public async Task Bookmarks_OmitsFormerlyBookmarkedNowPrivateCollection_ForNonOwner()
    {
        Collection stillPublic = await SeedAsync(isPublic: true);
        Collection nowPrivate = await SeedAsync(isPublic: true);
        await BookmarkAsync(stillPublic, _otherId.ToString());
        await BookmarkAsync(nowPrivate, _otherId.ToString());
        nowPrivate.IsPublic = false;
        await DbContext.SaveChangesAsync();

        using HttpResponseMessage response = await GetAsync("/collections/bookmarks", OtherToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("collections").EnumerateArray()
            .Select(e => e.GetProperty("id").GetString())
            .Should().Equal(stillPublic.Id.ToString());
    }

    [Fact]
    public async Task Bookmarks_KeepsPrivateCollection_ForOwner()
    {
        Collection mine = await SeedAsync(isPublic: false);
        await BookmarkAsync(mine, _ownerId.ToString());

        using HttpResponseMessage response = await GetAsync("/collections/bookmarks", OwnerToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("collections").GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task Bookmarks_OmitsPrivateCollection_ForAdminNonOwner()
    {
        Collection nowPrivate = await SeedAsync(isPublic: false);
        await BookmarkAsync(nowPrivate, _adminId.ToString());

        using HttpResponseMessage response = await GetAsync("/collections/bookmarks", AdminToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("collections").GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task Bookmarks_Anonymous_Returns401()
    {
        using HttpResponseMessage response = await GetAsync("/collections/bookmarks", null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
