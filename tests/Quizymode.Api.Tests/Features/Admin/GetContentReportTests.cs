using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetContentReportTests : DatabaseTestFixture
{
    private static readonly DateTime Now = DateTime.UtcNow;

    private static PageView Hit(string session, string area, string? scopeType = null, string? scopeKey = null, string? navPath = null, int minutesAgo = 10, bool isBot = false, bool isItemStep = false) => new()
    {
        Id = Guid.NewGuid(),
        SessionId = session,
        IpAddress = "203.0.113.1",
        Path = "/",
        Url = "/",
        Area = area,
        ScopeType = scopeType,
        ScopeKey = scopeKey,
        NavPath = navPath,
        IsItemStep = isItemStep,
        IsBot = isBot,
        CreatedUtc = Now.AddMinutes(-minutesAgo)
    };

    private Task<Result<GetContentReport.Response>> Run(int days = 30, bool includeBots = false) =>
        GetContentReport.HandleAsync(new GetContentReport.QueryRequest(days, includeBots), DbContext, CancellationToken.None);

    [Fact]
    public async Task HandleAsync_AggregatesCategoryAndCollectionMetrics()
    {
        Category science = new() { Id = Guid.NewGuid(), Name = "Science", CreatedAt = Now };
        Collection collection = new() { Id = Guid.NewGuid(), Name = "Space", IsPublic = true, CreatedBy = "u", CreatedAt = Now.AddDays(-100) };
        Item item = new() { Id = Guid.NewGuid(), CategoryId = science.Id, Question = "q", CorrectAnswer = "a", CreatedBy = "u", IsRepoManaged = true, CreatedAt = Now.AddDays(-100) };
        await DbContext.Categories.AddAsync(science);
        await DbContext.Collections.AddAsync(collection);
        await DbContext.Items.AddAsync(item);
        await DbContext.CollectionItems.AddAsync(new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item.Id });
        await DbContext.Ratings.AddRangeAsync(
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 4, CreatedBy = "a", CreatedAt = Now.AddDays(-1) },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 5, CreatedBy = "b", CreatedAt = Now.AddDays(-1) },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 1, CreatedBy = "c", CreatedAt = Now.AddDays(-90) });
        await DbContext.Comments.AddAsync(new Comment { Id = Guid.NewGuid(), ItemId = item.Id, Text = "hi", CreatedBy = "a", CreatedAt = Now.AddDays(-1) });
        await DbContext.CollectionRatings.AddAsync(new CollectionRating { Id = Guid.NewGuid(), CollectionId = collection.Id, Stars = 3, CreatedBy = "a", CreatedAt = Now.AddDays(-1) });
        await DbContext.CollectionBookmarks.AddAsync(new CollectionBookmark { Id = Guid.NewGuid(), CollectionId = collection.Id, UserId = "a", CreatedAt = Now.AddDays(-1) });
        await DbContext.CollectionShares.AddRangeAsync(
            new CollectionShare { Id = Guid.NewGuid(), CollectionId = collection.Id, SharedBy = "a", CreatedAt = Now.AddDays(-1) },
            new CollectionShare { Id = Guid.NewGuid(), CollectionId = collection.Id, SharedBy = "a", CreatedAt = Now.AddDays(-1) });
        string id = collection.Id.ToString();
        await DbContext.PageViews.AddRangeAsync(
            Hit("s1", "browse", "category", "science", "science"),
            Hit("s2", "quiz", "category", "science", "science", isItemStep: true),
            Hit("s2", "quiz", "category", "science", "science", isItemStep: true),
            Hit("s3", "quiz", "category", "science", "science", isBot: true),
            Hit("s1", "collections", "collection", id));
        await DbContext.SaveChangesAsync();

        GetContentReport.Response report = (await Run()).Value!;

        GetContentReport.ContentRowResponse row = report.Categories.Single(r => r.Key == "science");
        row.Sessions.Should().Be(2);
        row.StudySessions.Should().Be(1);
        row.ItemSteps.Should().Be(2);
        row.RatingsCount.Should().Be(2);
        row.AverageStars.Should().Be(4.5);
        row.Comments.Should().Be(1);
        row.Bookmarks.Should().BeNull();

        GetContentReport.ContentRowResponse col = report.Collections.Single();
        col.Name.Should().Be("Space");
        col.Sessions.Should().Be(1);
        col.RatingsCount.Should().Be(3); // 2 item ratings + 1 collection rating
        col.Bookmarks.Should().Be(1);
        col.Shares.Should().Be(2);
        report.BotsExcluded.Should().BeTrue();
        report.BotSessions.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_FeaturedClickThroughCountsSessionOncePerEntry()
    {
        Collection collection = new() { Id = Guid.NewGuid(), Name = "Space", IsPublic = true, CreatedBy = "u", CreatedAt = Now };
        await DbContext.Collections.AddAsync(collection);
        FeaturedItem set = new() { Id = Guid.NewGuid(), Type = FeaturedItemType.Set, DisplayName = "Capitals", CategorySlug = "geography", NavKeyword1 = "capitals", CreatedBy = "a" };
        FeaturedItem col = new() { Id = Guid.NewGuid(), Type = FeaturedItemType.Collection, DisplayName = "Space", CollectionId = collection.Id, CreatedBy = "a" };
        await DbContext.FeaturedItems.AddRangeAsync(set, col);
        await DbContext.PageViews.AddRangeAsync(
            Hit("s1", "home", minutesAgo: 30),
            Hit("s1", "browse", "category", "geography", "geography/capitals", minutesAgo: 20),
            Hit("s1", "browse", "category", "geography", "geography/capitals", minutesAgo: 10),
            Hit("s2", "featured", minutesAgo: 30),
            Hit("s3", "browse", "category", "geography", "geography/capitals", minutesAgo: 30), // never saw featured
            Hit("s4", "browse", "category", "geography", "geography/rivers", minutesAgo: 20), // other nav set
            Hit("s4", "home", minutesAgo: 30));
        await DbContext.SaveChangesAsync();

        GetContentReport.Response report = (await Run()).Value!;

        GetContentReport.FeaturedRowResponse setRow = report.Featured.Single(f => f.Id == set.Id);
        setRow.SessionsSeen.Should().Be(3);
        setRow.SessionsOpened.Should().Be(1);
        setRow.ClickThroughPercent.Should().Be(33.3);
        report.Featured.Single(f => f.Id == col.Id).SessionsOpened.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_UntouchedExcludesPrivateAndStudiedContent()
    {
        Collection studied = new() { Id = Guid.NewGuid(), Name = "Studied", IsPublic = true, CreatedBy = "u", CreatedAt = Now };
        Collection idle = new() { Id = Guid.NewGuid(), Name = "Idle", IsPublic = true, CreatedBy = "u", CreatedAt = Now };
        Collection hidden = new() { Id = Guid.NewGuid(), Name = "Hidden", IsPublic = false, CreatedBy = "u", CreatedAt = Now };
        await DbContext.Collections.AddRangeAsync(studied, idle, hidden);
        await DbContext.Categories.AddRangeAsync(
            new Category { Id = Guid.NewGuid(), Name = "Science", CreatedAt = Now },
            new Category { Id = Guid.NewGuid(), Name = "Art", CreatedAt = Now },
            new Category { Id = Guid.NewGuid(), Name = "Secret", IsPrivate = true, CreatedAt = Now });
        await DbContext.PageViews.AddRangeAsync(
            Hit("s1", "quiz", "category", "science", "science"),
            Hit("s1", "flashcards", "collection", studied.Id.ToString()),
            Hit("s2", "browse", "category", "art", "art")); // browsing is not studying
        await DbContext.SaveChangesAsync();

        GetContentReport.Response report = (await Run()).Value!;

        report.UntouchedCategories.Select(c => c.Key).Should().BeEquivalentTo(["art"]);
        report.UntouchedCollections.Select(c => c.Name).Should().BeEquivalentTo(["Idle"]);
    }

    [Fact]
    public async Task HandleAsync_UserCreatedCountsSplitByWeekAndSkipRepoManaged()
    {
        DateTime when = Now.AddDays(-2);
        await DbContext.Items.AddRangeAsync(
            NewItem(isPrivate: true, repo: false, when),
            NewItem(isPrivate: false, repo: false, when),
            NewItem(isPrivate: false, repo: false, when),
            NewItem(isPrivate: false, repo: true, when));
        await DbContext.Collections.AddRangeAsync(
            new Collection { Id = Guid.NewGuid(), Name = "Mine", CreatedBy = "u", CreatedAt = when },
            new Collection { Id = Guid.NewGuid(), Name = "Repo", IsRepoManaged = true, CreatedBy = "u", CreatedAt = when });
        await DbContext.SaveChangesAsync();

        GetContentReport.UserCreatedWeekResponse week = (await Run()).Value!.UserCreated.Single();

        week.PrivateItems.Should().Be(1);
        week.PublicItems.Should().Be(2);
        week.Collections.Should().Be(1);
        week.WeekStartUtc.DayOfWeek.Should().Be(DayOfWeek.Monday);
    }

    [Fact]
    public async Task HandleAsync_RejectsInvalidDays()
    {
        (await Run(days: 0)).IsFailure.Should().BeTrue();
    }

    private static Item NewItem(bool isPrivate, bool repo, DateTime createdAt) => new()
    {
        Id = Guid.NewGuid(), Question = "q", CorrectAnswer = "a", CreatedBy = "u", IsPrivate = isPrivate, IsRepoManaged = repo, CreatedAt = createdAt
    };
}
