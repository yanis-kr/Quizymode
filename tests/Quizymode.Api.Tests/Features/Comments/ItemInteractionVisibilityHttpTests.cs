using System.Net;
using System.Text;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Features.Ratings;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Comments;

/// <summary>
/// #293: comments and ratings addressed by item id follow the item access rule (accessible by id, or published through a
/// public collection of the item creator); otherwise the same empty 404 as a missing id, with no side effects.
/// </summary>
public sealed class ItemInteractionVisibilityHttpTests : DatabaseTestFixture, IAsyncLifetime
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
            services =>
            {
                services.AddMemoryCache();
                services.AddScoped<IValidator<AddComment.Request>, AddComment.Validator>();
                services.AddScoped<IValidator<AddOrUpdateRating.Request>, AddOrUpdateRating.Validator>();
            },
            app =>
            {
                new GetComments.Endpoint().MapEndpoint(app);
                new AddComment.Endpoint().MapEndpoint(app);
                new GetRatings.Endpoint().MapEndpoint(app);
                new AddOrUpdateRating.Endpoint().MapEndpoint(app);
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

    public static TheoryData<string> Kinds => new() { "get-comments", "post-comment", "get-ratings", "post-rating" };

    private string OwnerToken => _host.CreateToken("owner-sub", "owner@example.com");

    private string OtherToken => _host.CreateToken("other-sub", "other@example.com");

    private string AdminToken => _host.CreateToken("admin-sub", "admin@example.com", AdminGroups);

    private static bool IsWrite(string kind) => kind.StartsWith("post", StringComparison.Ordinal);

    private async Task<Item> SeedItemAsync(bool isPrivate)
    {
        Category category = VisibilitySeed.AddCategory(DbContext);
        Item item = VisibilitySeed.AddItem(DbContext, category, _ownerId.ToString(), isPrivate);
        await DbContext.SaveChangesAsync();
        return item;
    }

    private async Task PublishAsync(Item item, string collectionOwnerId, bool isPublic)
    {
        Collection collection = VisibilitySeed.AddCollection(DbContext, collectionOwnerId, isPublic);
        VisibilitySeed.Link(DbContext, collection, item);
        await DbContext.SaveChangesAsync();
    }

    private async Task<HttpResponseMessage> SendAsync(string kind, Guid itemId, string? token)
    {
        HttpMethod method = IsWrite(kind) ? HttpMethod.Post : HttpMethod.Get;
        string path = kind switch
        {
            "get-comments" => $"/comments?itemId={itemId}",
            "post-comment" => "/comments",
            _ => $"/ratings/{itemId}"
        };
        string? json = kind switch
        {
            "post-comment" => $"{{\"itemId\":\"{itemId}\",\"text\":\"hello\"}}",
            "post-rating" => "{\"stars\":4}",
            _ => null
        };
        using StringContent? content = json is null ? null : new StringContent(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path, token, content);
        return await _host.Client.SendAsync(request);
    }

    private async Task<(int Comments, int Ratings)> CountsAsync()
    {
        await using ApplicationDbContext db = CreateDbContext();
        return (await db.Comments.CountAsync(), await db.Ratings.CountAsync());
    }

    private static HttpStatusCode SuccessFor(string kind) =>
        kind == "post-comment" ? HttpStatusCode.Created : HttpStatusCode.OK;

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
    public async Task PrivateItem_OtherUser_GetsSame404AsMissingId_AndWritesNothing(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);
        (int Comments, int Ratings) before = await CountsAsync();

        using HttpResponseMessage denied = await SendAsync(kind, item.Id, OtherToken);
        using HttpResponseMessage missing = await SendAsync(kind, Guid.NewGuid(), OtherToken);

        await AssertIdenticalNotFoundAsync(denied, missing);
        (await denied.Content.ReadAsStringAsync()).Should().BeEmpty();
        (await CountsAsync()).Should().Be(before);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task PrivateItem_Anonymous_ReadsAre404_AndWritesAre401(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);

        using HttpResponseMessage response = await SendAsync(kind, item.Id, null);

        response.StatusCode.Should().Be(IsWrite(kind) ? HttpStatusCode.Unauthorized : HttpStatusCode.NotFound);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task PrivateItem_OwnerAndAdmin_Succeed(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);

        using HttpResponseMessage owner = await SendAsync(kind, item.Id, OwnerToken);
        using HttpResponseMessage admin = await SendAsync(kind, item.Id, AdminToken);

        owner.StatusCode.Should().Be(SuccessFor(kind));
        admin.StatusCode.Should().Be(SuccessFor(kind));
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task PrivateItem_InOwnersPublicCollection_IsOpenToOtherUsersAndAnonymousReads(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);
        await PublishAsync(item, _ownerId.ToString(), isPublic: true);

        using HttpResponseMessage other = await SendAsync(kind, item.Id, OtherToken);

        other.StatusCode.Should().Be(SuccessFor(kind));
        if (!IsWrite(kind))
        {
            using HttpResponseMessage anonymous = await SendAsync(kind, item.Id, null);
            anonymous.StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task PrivateItem_InOwnersPrivateCollection_StaysHidden(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);
        await PublishAsync(item, _ownerId.ToString(), isPublic: false);

        using HttpResponseMessage other = await SendAsync(kind, item.Id, OtherToken);

        other.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task PrivateItem_OnlyInAnotherUsersPublicCollection_StaysHidden(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);
        await PublishAsync(item, _adminId.ToString(), isPublic: true);

        using HttpResponseMessage other = await SendAsync(kind, item.Id, OtherToken);

        other.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Theory]
    [MemberData(nameof(Kinds))]
    public async Task PublicItem_IsUnchanged(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: false);

        using HttpResponseMessage other = await SendAsync(kind, item.Id, OtherToken);

        other.StatusCode.Should().Be(SuccessFor(kind));
        if (!IsWrite(kind))
        {
            using HttpResponseMessage anonymous = await SendAsync(kind, item.Id, null);
            anonymous.StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }
}
