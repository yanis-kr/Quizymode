using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Features.Featured;
using Quizymode.Api.Features.Keywords;
using Quizymode.Api.Features.Progress;
using Quizymode.Api.Features.Ratings;
using Quizymode.Api.Features.Taxonomy;
using Plans = Quizymode.Api.Features.StudyPlans.StudyPlans;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>
/// #400 (AC 3.25.10; the games route is covered in GameRosterHttpTests): the taxonomy, keyword, discover, bookmark and study-plan count routes over real HTTP with the production JWT
/// pipeline. An item whose uploaded pictures are not Approved is omitted for a non-owner and still counted for its creator.
/// #890 (AC 3.25.16 to 3.25.18): featured sets and collections, set progress, and comments and ratings on the same seed. Global search and
/// study-guide similarity need PostgreSQL and live in PictureEligibilityPostgresHttpTests.
/// </summary>
public sealed class PictureEligibilityRoutesHttpTests : ItemTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;
    private Guid _ownerId;
    private Guid _otherId;
    private Category _category = null!;
    private Item _pending = null!;
    private Item _approvedPicture = null!;
    private Collection _mixedCollection = null!;
    private Collection _pendingOnlyCollection = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddSingleton(TaxonomyRegistry);
                services.AddSingleton(TimeProvider.System);
                services.AddScoped<IValidator<Plans.UpsertRequest>, Plans.UpsertValidator>();
                services.AddMemoryCache();
                services.AddScoped<IValidator<AddComment.Request>, AddComment.Validator>();
                services.AddScoped<IValidator<AddOrUpdateRating.Request>, AddOrUpdateRating.Validator>();
            },
            app =>
            {
                new GetTaxonomy.Endpoint().MapEndpoint(app);
                new GetKeywords.Endpoint().MapEndpoint(app);
                new DiscoverCollections.Endpoint().MapEndpoint(app);
                new GetBookmarks.Endpoint().MapEndpoint(app);
                new Plans.Endpoint().MapEndpoint(app);
                new GetFeatured.Endpoint().MapEndpoint(app);
                new GetSetProgress.Endpoint().MapEndpoint(app);
                new GetComments.Endpoint().MapEndpoint(app);
                new AddComment.Endpoint().MapEndpoint(app);
                new GetRatings.Endpoint().MapEndpoint(app);
                new AddOrUpdateRating.Endpoint().MapEndpoint(app);
            });

        _ownerId = Guid.NewGuid();
        _otherId = Guid.NewGuid();
        DbContext.Users.AddRange(
            new User { Id = _ownerId, Subject = "owner-sub", Email = "owner@example.com", Name = "owner" },
            new User { Id = _otherId, Subject = "other-sub", Email = "other@example.com", Name = "other" });
        await DbContext.SaveChangesAsync();
        await SeedAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private string Owner => _ownerId.ToString();

    private string OwnerToken => _host.CreateToken("owner-sub", "owner@example.com");

    private string OtherToken => _host.CreateToken("other-sub", "other@example.com");

    private async Task SeedAsync()
    {
        _category = new Category { Id = Guid.NewGuid(), Name = "trivia", IsPrivate = false, CreatedBy = "seeder", CreatedAt = DateTime.UtcNow };
        Keyword general = new() { Id = Guid.NewGuid(), Name = "general", Slug = "general", IsPrivate = false, CreatedBy = "seeder", CreatedAt = DateTime.UtcNow };
        Keyword mixed = new() { Id = Guid.NewGuid(), Name = "mixed", Slug = "mixed", IsPrivate = false, CreatedBy = "seeder", CreatedAt = DateTime.UtcNow };
        DbContext.AddRange(_category, general, mixed);
        DbContext.AddRange(
            Relation(_category.Id, null, general.Id, 0),
            Relation(_category.Id, general.Id, general.Id, 0),
            Relation(_category.Id, general.Id, mixed.Id, 1));

        Item textOne = Navigate(VisibilitySeed.AddItem(DbContext, _category, Owner, false), general, mixed);
        Item textTwo = Navigate(VisibilitySeed.AddItem(DbContext, _category, Owner, false), general, mixed);
        _approvedPicture = Navigate(
            PictureSeed.AddPictureItem(DbContext, _category, Owner, false, ItemImageReviewState.Approved, PictureSeed.AddAsset(DbContext, Owner)), general, mixed);
        _pending = Navigate(
            PictureSeed.AddPictureItem(DbContext, _category, Owner, false, ItemImageReviewState.PendingReview, PictureSeed.AddAsset(DbContext, Owner)), general, mixed);

        _mixedCollection = VisibilitySeed.AddCollection(DbContext, Owner, true);
        _mixedCollection.IsDiscoverable = true;
        _pendingOnlyCollection = VisibilitySeed.AddCollection(DbContext, Owner, true);
        _pendingOnlyCollection.IsDiscoverable = true;
        foreach (Item item in new[] { textOne, textTwo, _approvedPicture, _pending })
        {
            VisibilitySeed.Link(DbContext, _mixedCollection, item);
        }

        VisibilitySeed.Link(DbContext, _pendingOnlyCollection, _pending);
        DbContext.CollectionBookmarks.AddRange(
            new CollectionBookmark { Id = Guid.NewGuid(), UserId = Owner, CollectionId = _mixedCollection.Id },
            new CollectionBookmark { Id = Guid.NewGuid(), UserId = _otherId.ToString(), CollectionId = _mixedCollection.Id });
        DbContext.StudyPlans.AddRange(
            new StudyPlan { UserId = Owner, CollectionId = _mixedCollection.Id, TestDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(5), CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new StudyPlan { UserId = _otherId.ToString(), CollectionId = _mixedCollection.Id, TestDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(5), CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();
    }

    private static Item Navigate(Item item, Keyword nav1, Keyword nav2)
    {
        item.NavigationKeywordId1 = nav1.Id;
        item.NavigationKeywordId2 = nav2.Id;
        return item;
    }

    private static KeywordRelation Relation(Guid categoryId, Guid? parent, Guid child, int order) => new()
    {
        Id = Guid.NewGuid(), CategoryId = categoryId, ParentKeywordId = parent, ChildKeywordId = child, SortOrder = order, CreatedAt = DateTime.UtcNow, IsPrivate = false
    };

    private async Task<JsonElement> GetAsync(string url, string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, url, token);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        string body = await response.Content.ReadAsStringAsync();
        response.StatusCode.Should().Be(HttpStatusCode.OK, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Taxonomy_CountsOmitUnapprovedPictureItems_ForANonOwner_ButKeepThemForTheCreator()
    {
        JsonElement other = await GetAsync("/taxonomy", OtherToken);
        JsonElement owner = await GetAsync("/taxonomy", OwnerToken);

        GroupCount(other).Should().Be(3);
        GroupCount(owner).Should().Be(4);

        static int GroupCount(JsonElement body) => body.GetProperty("categories").EnumerateArray()
            .Single(c => c.GetProperty("slug").GetString() == "trivia")
            .GetProperty("groups").EnumerateArray()
            .Single(g => g.GetProperty("slug").GetString() == "general")
            .GetProperty("itemCount").GetInt32();
    }

    [Fact]
    public async Task Keywords_CountsOmitUnapprovedPictureItems_ForANonOwner_ButKeepThemForTheCreator()
    {
        string url = "/keywords?category=trivia&selectedKeywords=general";

        JsonElement other = await GetAsync(url, OtherToken);
        JsonElement owner = await GetAsync(url, OwnerToken);

        MixedCount(other).Should().Be(3);
        MixedCount(owner).Should().Be(4);

        static int MixedCount(JsonElement body) => body.GetProperty("keywords").EnumerateArray()
            .Single(k => k.GetProperty("name").GetString() == "mixed")
            .GetProperty("itemCount").GetInt32();
    }

    [Fact]
    public async Task Discover_ItemCountsAndItemFilters_OmitUnapprovedPictureItems_ForANonOwner()
    {
        JsonElement other = await GetAsync("/collections/discover", OtherToken);
        JsonElement filtered = await GetAsync("/collections/discover?category=trivia", OtherToken);

        CountOf(other, _mixedCollection).Should().Be(3);
        CountOf(filtered, _mixedCollection).Should().Be(3);
        filtered.GetProperty("items").EnumerateArray().Select(c => c.GetProperty("id").GetString())
            .Should().NotContain(_pendingOnlyCollection.Id.ToString(), "its only item is not approved");
        other.GetProperty("items").EnumerateArray().Select(c => c.GetProperty("id").GetString())
            .Should().Contain(_pendingOnlyCollection.Id.ToString());
        CountOf(other, _pendingOnlyCollection).Should().Be(0);
    }

    [Fact]
    public async Task Bookmarks_ItemCounts_OmitUnapprovedPictureItems_ForANonOwner_ButNotTheCreator()
    {
        JsonElement other = await GetAsync("/collections/bookmarks", OtherToken);
        JsonElement owner = await GetAsync("/collections/bookmarks", OwnerToken);

        BookmarkCount(other).Should().Be(3);
        BookmarkCount(owner).Should().Be(4);

        int BookmarkCount(JsonElement body) => body.GetProperty("collections").EnumerateArray()
            .Single(c => c.GetProperty("id").GetString() == _mixedCollection.Id.ToString())
            .GetProperty("itemCount").GetInt32();
    }

    [Fact]
    public async Task StudyPlans_ItemCounts_OmitUnapprovedPictureItems_ForANonOwner_ButNotTheCreator()
    {
        JsonElement other = await GetAsync("/study-plans", OtherToken);
        JsonElement owner = await GetAsync("/study-plans", OwnerToken);

        PlanCount(other).Should().Be(3);
        PlanCount(owner).Should().Be(4);

        static int PlanCount(JsonElement body) => body.GetProperty("plans").EnumerateArray().Single().GetProperty("itemCount").GetInt32();
    }

    private string AdminToken => _host.CreateToken("admin-sub", "admin@example.com", ["Admins"]);

    private async Task SetPendingStateAsync(ItemImageReviewState state)
    {
        _pending.ImageReviewState = state;
        await DbContext.SaveChangesAsync();
    }

    private async Task<HttpStatusCode> StatusAsync(HttpMethod method, string url, string? token, object? body = null)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, url, token, body is null ? null : JsonContent.Create(body));
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return response.StatusCode;
    }

    [Theory]
    [InlineData(ItemImageReviewState.PendingReview)]
    [InlineData(ItemImageReviewState.Rejected)]
    public async Task Featured_SetAndCollectionCounts_OmitUnapprovedPictureItems_UntilApproved(ItemImageReviewState state)
    {
        await SetPendingStateAsync(state);
        FeaturedItem set = new() { Id = Guid.NewGuid(), Type = FeaturedItemType.Set, DisplayName = "set", CategorySlug = "trivia", NavKeyword1 = "general", CreatedBy = "admin" };
        FeaturedItem collection = new() { Id = Guid.NewGuid(), Type = FeaturedItemType.Collection, DisplayName = "col", CollectionId = _mixedCollection.Id, CreatedBy = "admin" };
        DbContext.FeaturedItems.AddRange(set, collection);
        await DbContext.SaveChangesAsync();

        JsonElement anonymous = await GetAsync("/featured", null);
        JsonElement owner = await GetAsync("/featured", OwnerToken);

        Counts(anonymous).Should().Be((3, 3), "the unapproved picture item is hidden from other people");
        Counts(owner).Should().Be((3, 3), "featured cards are the anonymous view, the same for everyone");

        await SetPendingStateAsync(ItemImageReviewState.Approved);
        Counts(await GetAsync("/featured", null)).Should().Be((4, 4));

        (int Set, int Collection) Counts(JsonElement body) => (
            body.GetProperty("sets").EnumerateArray().Single(s => s.GetProperty("id").GetString() == set.Id.ToString()).GetProperty("itemCount").GetInt32(),
            body.GetProperty("collections").EnumerateArray().Single(c => c.GetProperty("id").GetString() == collection.Id.ToString()).GetProperty("itemCount").GetInt32());
    }

    [Theory]
    [InlineData(ItemImageReviewState.PendingReview)]
    [InlineData(ItemImageReviewState.Rejected)]
    public async Task SetProgress_CollectionAndCategoryScopes_DoNotCountUnapprovedPictureItems_ForANonOwner_ButDoForTheCreator(ItemImageReviewState state)
    {
        await SetPendingStateAsync(state);
        List<Guid> itemIds = await DbContext.Items.Where(i => i.CategoryId == _category.Id).Select(i => i.Id).ToListAsync();
        foreach (string userId in new[] { Owner, _otherId.ToString() })
        {
            DbContext.UserItemProgress.AddRange(itemIds.Select(id => new UserItemProgress { UserId = userId, ItemId = id, IsKnown = true, LastCorrectAt = DateTime.UtcNow }));
        }

        await DbContext.SaveChangesAsync();
        string url = $"/users/me/set-progress?scopes=c/{_mixedCollection.Id},s/trivia,s/trivia/general";

        Known(await GetAsync(url, OtherToken)).Should().Equal(3, 3, 3);
        Known(await GetAsync(url, OwnerToken)).Should().Equal(4, 4, 4);

        static List<int> Known(JsonElement body) => body.GetProperty("scopes").EnumerateArray().Select(s => s.GetProperty("knownCount").GetInt32()).ToList();
    }

    [Theory]
    [InlineData(ItemImageReviewState.PendingReview)]
    [InlineData(ItemImageReviewState.Rejected)]
    public async Task CommentsAndRatings_OnAnUnapprovedPictureItem_Are404ForANonOwner_LikeAMissingItem_ButWorkForTheCreatorAndAdmins(ItemImageReviewState state)
    {
        await SetPendingStateAsync(state);
        Guid missing = Guid.NewGuid();
        object comment = new { itemId = _pending.Id, text = "Nice" };
        object rating = new { stars = 4 };

        foreach (Guid id in new[] { _pending.Id, missing })
        {
            (await StatusAsync(HttpMethod.Get, $"/comments?itemId={id}", null)).Should().Be(HttpStatusCode.NotFound);
            (await StatusAsync(HttpMethod.Get, $"/comments?itemId={id}", OtherToken)).Should().Be(HttpStatusCode.NotFound);
            (await StatusAsync(HttpMethod.Post, "/comments", OtherToken, new { itemId = id, text = "Nice" })).Should().Be(HttpStatusCode.NotFound);
            (await StatusAsync(HttpMethod.Get, $"/ratings/{id}", null)).Should().Be(HttpStatusCode.NotFound);
            (await StatusAsync(HttpMethod.Get, $"/ratings/{id}", OtherToken)).Should().Be(HttpStatusCode.NotFound);
            (await StatusAsync(HttpMethod.Post, $"/ratings/{id}", OtherToken, rating)).Should().Be(HttpStatusCode.NotFound);
        }

        foreach (string token in new[] { OwnerToken, AdminToken })
        {
            (await StatusAsync(HttpMethod.Post, "/comments", token, comment)).Should().Be(HttpStatusCode.Created);
            (await StatusAsync(HttpMethod.Get, $"/comments?itemId={_pending.Id}", token)).Should().Be(HttpStatusCode.OK);
            (await StatusAsync(HttpMethod.Post, $"/ratings/{_pending.Id}", token, rating)).Should().Be(HttpStatusCode.OK);
            (await StatusAsync(HttpMethod.Get, $"/ratings/{_pending.Id}", token)).Should().Be(HttpStatusCode.OK);
        }

        (await DbContext.Comments.CountAsync(c => c.ItemId == _pending.Id)).Should().Be(2, "only the creator and the admin wrote");
    }

    private int CountOf(JsonElement body, Collection collection) => body.GetProperty("items").EnumerateArray()
        .Single(c => c.GetProperty("id").GetString() == collection.Id.ToString())
        .GetProperty("itemCount").GetInt32();
}
