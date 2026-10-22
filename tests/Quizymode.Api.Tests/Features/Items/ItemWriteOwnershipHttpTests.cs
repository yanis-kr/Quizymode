using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Delete;
using Quizymode.Api.Features.Items.Update;
using Quizymode.Api.Features.Items.UpdateCategories;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>
/// #286: PUT /items/{id}, DELETE /items/{id} and PUT /items/{id}/category are owner-or-admin only.
/// Runs the real endpoints behind the production JWT configuration so 401/403/404 are observed over HTTP.
/// </summary>
public sealed class ItemWriteOwnershipHttpTests : ItemTestFixture, IAsyncLifetime
{
    private const string UpdateJson =
        "{\"category\":\"geography\",\"navigationKeyword1\":\"capitals\",\"navigationKeyword2\":\"europe\",\"question\":\"Updated?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\",\"C\"],\"explanation\":\"new\",\"isPrivate\":false,\"keywords\":[{\"name\":\"brandnewkw\",\"isPrivate\":true}]}";

    private const string CategoryJson = "{\"categoryName\":\"brand-new-cat\",\"isPrivate\":true}";

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
                services.AddScoped<IValidator<UpdateItem.Request>, UpdateItem.Validator>();
                services.AddScoped<IValidator<UpdateItemCategories.Request>, UpdateItemCategories.Validator>();
                services.AddSingleton<ISimHashService>(SimHashService);
                services.AddSingleton(TaxonomyRegistry);
                services.AddScoped<ITaxonomyItemCategoryResolver>(sp =>
                    new TaxonomyItemCategoryResolver(sp.GetRequiredService<ApplicationDbContext>(), TaxonomyRegistry));
                services.AddScoped<ICategoryResolver, CategoryResolver>();
            },
            app =>
            {
                new UpdateItem.Endpoint().MapEndpoint(app);
                new DeleteItem.Endpoint().MapEndpoint(app);
                new UpdateItemCategories.Endpoint().MapEndpoint(app);
            });

        _ownerId = Guid.NewGuid();
        _otherId = Guid.NewGuid();
        _adminId = Guid.NewGuid();
        DbContext.Users.AddRange(
            new User { Id = _ownerId, Subject = "owner-sub", Email = "owner@example.com", Name = "owner" },
            new User { Id = _otherId, Subject = "other-sub", Email = "other@example.com", Name = "other" },
            new User { Id = _adminId, Subject = "admin-sub", Email = "admin@example.com", Name = "admin" });
        await DbContext.SaveChangesAsync();
        await EnsureGeographyPublicWithNavAsync(_ownerId.ToString());
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    public static TheoryData<string> Endpoints => new() { "update", "delete", "category" };

    private string OwnerToken => _host.CreateToken("owner-sub", "owner@example.com");

    private string OtherToken => _host.CreateToken("other-sub", "other@example.com");

    private string AdminToken => _host.CreateToken("admin-sub", "admin@example.com", ["Admins"]);

    private Task<Item> SeedItemAsync(bool isPrivate) =>
        CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Original?", "A", ["B"], "old", isPrivate, _ownerId.ToString());

    private async Task<HttpResponseMessage> SendAsync(string kind, string id, string? token, string? body = null)
    {
        HttpMethod method = kind == "delete" ? HttpMethod.Delete : HttpMethod.Put;
        string path = kind == "category" ? $"/items/{id}/category" : $"/items/{id}";
        string? json = kind switch
        {
            "update" => body ?? UpdateJson,
            "category" => body ?? CategoryJson,
            _ => null
        };
        using StringContent? content = json is null ? null : new StringContent(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path, token, content);
        return await _host.Client.SendAsync(request);
    }

    private sealed record Snapshot(
        bool Exists, string? Question, string? Explanation, bool IsPrivate, Guid? CategoryId,
        int Categories, int Keywords, int ItemKeywords, int Audits);

    private async Task<Snapshot> SnapshotAsync(Guid itemId)
    {
        await using ApplicationDbContext db = CreateDbContext();
        Item? item = await db.Items.AsNoTracking().FirstOrDefaultAsync(i => i.Id == itemId);
        return new Snapshot(
            item is not null, item?.Question, item?.Explanation, item?.IsPrivate ?? false, item?.CategoryId,
            await db.Categories.CountAsync(), await db.Keywords.CountAsync(),
            await db.ItemKeywords.CountAsync(), await db.Audits.CountAsync());
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task Owner_OfPrivateItem_Succeeds_AndChangePersists(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);
        Snapshot before = await SnapshotAsync(item.Id);

        using HttpResponseMessage response = await SendAsync(kind, item.Id.ToString(), OwnerToken);

        response.StatusCode.Should().Be(kind == "delete" ? HttpStatusCode.NoContent : HttpStatusCode.OK);
        Snapshot after = await SnapshotAsync(item.Id);
        switch (kind)
        {
            case "delete":
                after.Exists.Should().BeFalse();
                break;
            case "update":
                after.Question.Should().Be("Updated?");
                break;
            default:
                after.CategoryId.Should().NotBe(before.CategoryId!.Value);
                break;
        }
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task Admin_NotOwner_OnOthersPrivateItem_Succeeds(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);

        using HttpResponseMessage response = await SendAsync(kind, item.Id.ToString(), AdminToken);

        response.StatusCode.Should().Be(kind == "delete" ? HttpStatusCode.NoContent : HttpStatusCode.OK);
        Snapshot after = await SnapshotAsync(item.Id);
        if (kind == "delete")
        {
            after.Exists.Should().BeFalse();
        }
        else
        {
            after.Exists.Should().BeTrue();
        }
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task OtherUser_OnPrivateItem_Returns404IdenticalToMissingId_AndChangesNothing(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);
        Snapshot before = await SnapshotAsync(item.Id);

        using HttpResponseMessage denied = await SendAsync(kind, item.Id.ToString(), OtherToken);
        using HttpResponseMessage missing = await SendAsync(kind, Guid.NewGuid().ToString(), OtherToken);

        denied.StatusCode.Should().Be(HttpStatusCode.NotFound);
        missing.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await denied.Content.ReadAsStringAsync()).Should().Be(await missing.Content.ReadAsStringAsync());
        (await SnapshotAsync(item.Id)).Should().Be(before);
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task OtherUser_OnPublicItem_Returns403Forbidden_AndChangesNothing(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: false);
        Snapshot before = await SnapshotAsync(item.Id);

        using HttpResponseMessage response = await SendAsync(kind, item.Id.ToString(), OtherToken);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("title").GetString().Should().Be("Forbidden");
        body.RootElement.GetProperty("detail").GetString().Should().Be("You can only edit or delete your own items.");
        Snapshot after = await SnapshotAsync(item.Id);
        after.Should().Be(before);
        after.IsPrivate.Should().BeFalse();
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task Anonymous_Returns401_AndChangesNothing(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: false);
        Snapshot before = await SnapshotAsync(item.Id);

        using HttpResponseMessage response = await SendAsync(kind, item.Id.ToString(), token: null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await SnapshotAsync(item.Id)).Should().Be(before);
    }

    [Fact]
    public async Task Anonymous_PutWithInvalidBody_Returns401Not400()
    {
        Item item = await SeedItemAsync(isPrivate: false);

        using HttpResponseMessage response = await SendAsync("update", item.Id.ToString(), token: null, body: "{\"question\":\"\"}");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task OtherUser_PutWithInvalidBody_StillReturns400BeforeOwnershipCheck()
    {
        Item item = await SeedItemAsync(isPrivate: false);

        using HttpResponseMessage response = await SendAsync(
            "update", item.Id.ToString(), OtherToken,
            body: UpdateJson.Replace("\"question\":\"Updated?\"", "\"question\":\"\""));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task Owner_WithExpiredToken_Returns401(string kind)
    {
        Item item = await SeedItemAsync(isPrivate: true);
        string expired = _host.CreateToken(
            "owner-sub", "owner@example.com", expiresUtc: DateTime.UtcNow.AddMinutes(-30));
        Snapshot before = await SnapshotAsync(item.Id);

        using HttpResponseMessage response = await SendAsync(kind, item.Id.ToString(), expired);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await SnapshotAsync(item.Id)).Should().Be(before);
    }

    [Fact]
    public async Task Admin_EditingOthersItem_CreatesNewKeywordOwnedByItemCreator()
    {
        // AC 2.1.6 / K2 (#291)
        Item item = await SeedItemAsync(isPrivate: true);

        using HttpResponseMessage response = await SendAsync("update", item.Id.ToString(), AdminToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await using ApplicationDbContext db = CreateDbContext();
        List<Keyword> created = await db.Keywords.AsNoTracking().Where(k => k.Name == "brandnewkw").ToListAsync();
        created.Should().ContainSingle();
        created[0].CreatedBy.Should().Be(_ownerId.ToString());
        created[0].IsPrivate.Should().BeTrue();
    }

    [Fact]
    public async Task Admin_EditingOthersItem_ReusesCreatorsPrivateKeyword_NotAdminsOwn()
    {
        // AC 2.1.6 / K2 (#291)
        Item item = await SeedItemAsync(isPrivate: true);
        Keyword adminKw = NewPrivateKeyword("brandnewkw", _adminId.ToString());
        Keyword ownerKw = NewPrivateKeyword("brandnewkw", _ownerId.ToString());
        DbContext.Keywords.AddRange(adminKw, ownerKw);
        await DbContext.SaveChangesAsync();

        using HttpResponseMessage response = await SendAsync("update", item.Id.ToString(), AdminToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await using ApplicationDbContext db = CreateDbContext();
        List<Guid> attached = await db.ItemKeywords.AsNoTracking()
            .Where(ik => ik.ItemId == item.Id).Select(ik => ik.KeywordId).ToListAsync();
        attached.Should().Contain(ownerKw.Id).And.NotContain(adminKw.Id);
        (await db.Keywords.CountAsync(k => k.Name == "brandnewkw")).Should().Be(2);
    }

    [Fact]
    public async Task Owner_EditingOwnItem_CreatesNewKeywordOwnedByOwner()
    {
        // AC 2.1.6 (#291): unchanged behavior
        Item item = await SeedItemAsync(isPrivate: true);

        using HttpResponseMessage response = await SendAsync("update", item.Id.ToString(), OwnerToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await using ApplicationDbContext db = CreateDbContext();
        (await db.Keywords.AsNoTracking().SingleAsync(k => k.Name == "brandnewkw"))
            .CreatedBy.Should().Be(_ownerId.ToString());
    }

    [Fact]
    public async Task Admin_EditingOwnItem_CreatesNewKeywordOwnedByAdmin()
    {
        // AC 2.1.6 (#291): unchanged behavior
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Original?", "A", ["B"], "old", true, _adminId.ToString());

        using HttpResponseMessage response = await SendAsync("update", item.Id.ToString(), AdminToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await using ApplicationDbContext db = CreateDbContext();
        (await db.Keywords.AsNoTracking().SingleAsync(k => k.Name == "brandnewkw"))
            .CreatedBy.Should().Be(_adminId.ToString());
    }

    [Fact]
    public async Task NonAdminOwner_EditingPublicItem_SetsItBackToPrivate()
    {
        // AC 2.1.6 (#290)
        Item item = await SeedItemAsync(isPrivate: false);

        using HttpResponseMessage response = await SendAsync("update", item.Id.ToString(), OwnerToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await SnapshotAsync(item.Id)).IsPrivate.Should().BeTrue();
    }

    [Fact]
    public async Task Admin_EditingPublicItem_KeepsRequestedVisibility()
    {
        // AC 2.1.6 (#290)
        Item item = await SeedItemAsync(isPrivate: false);

        using HttpResponseMessage response = await SendAsync("update", item.Id.ToString(), AdminToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await SnapshotAsync(item.Id)).IsPrivate.Should().BeFalse();
    }

    private static Keyword NewPrivateKeyword(string name, string createdBy) => new()
    {
        Id = Guid.NewGuid(),
        Name = name,
        Slug = name,
        IsPrivate = true,
        CreatedBy = createdBy,
        CreatedAt = DateTime.UtcNow,
        IsReviewPending = true
    };
}
