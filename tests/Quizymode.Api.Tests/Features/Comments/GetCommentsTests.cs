using System.Net;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Comments;

public sealed class GetCommentsTests : DatabaseTestFixture
{

    [Fact]
    public async Task HandleAsync_NoComments_ReturnsEmptyList()
    {
        // Arrange
        GetComments.QueryRequest request = new(null);

        // Act
        Result<GetComments.Response> result = await GetComments.HandleAsync(
            request,
            DbContext,
            FakeUserContext.Anonymous,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Comments.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_WithItemId_ReturnsFilteredComments()
    {
        // Arrange
        Item item1 = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Question 1", "Answer 1",
            new List<string> { "Wrong" }, "", false, "test");

        Item item2 = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "history", "Question 2", "Answer 2",
            new List<string> { "Wrong" }, "", false, "test");

        DbContext.Comments.AddRange(
            new Comment { Id = Guid.NewGuid(), ItemId = item1.Id, Text = "Comment 1", CreatedBy = "user1", CreatedAt = DateTime.UtcNow.AddMinutes(-10) },
            new Comment { Id = Guid.NewGuid(), ItemId = item1.Id, Text = "Comment 2", CreatedBy = "user2", CreatedAt = DateTime.UtcNow.AddMinutes(-5) },
            new Comment { Id = Guid.NewGuid(), ItemId = item2.Id, Text = "Comment 3", CreatedBy = "user3", CreatedAt = DateTime.UtcNow }
        );

        await DbContext.SaveChangesAsync();

        GetComments.QueryRequest request = new(item1.Id);

        // Act
        Result<GetComments.Response> result = await GetComments.HandleAsync(
            request,
            DbContext,
            FakeUserContext.Anonymous,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Comments.Should().HaveCount(2);
        result.Value.Comments.Should().OnlyContain(c => c.ItemId == item1.Id);
        result.Value.Comments.Should().BeInDescendingOrder(c => c.CreatedAt); // Should be ordered by CreatedAt descending
    }

    [Fact]
    public async Task HandleAsync_NoItemId_ReturnsAllComments()
    {
        // Arrange
        Item item1 = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Question 1", "Answer 1",
            new List<string> { "Wrong" }, "", false, "test");

        Item item2 = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "history", "Question 2", "Answer 2",
            new List<string> { "Wrong" }, "", false, "test");

        DbContext.Comments.AddRange(
            new Comment { Id = Guid.NewGuid(), ItemId = item1.Id, Text = "Comment 1", CreatedBy = "user1", CreatedAt = DateTime.UtcNow.AddMinutes(-10) },
            new Comment { Id = Guid.NewGuid(), ItemId = item2.Id, Text = "Comment 2", CreatedBy = "user2", CreatedAt = DateTime.UtcNow.AddMinutes(-5) }
        );

        await DbContext.SaveChangesAsync();

        GetComments.QueryRequest request = new(null);

        // Act
        Result<GetComments.Response> result = await GetComments.HandleAsync(
            request,
            DbContext,
            FakeUserContext.Anonymous,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Comments.Should().HaveCount(2);
        result.Value.Comments.Should().BeInDescendingOrder(c => c.CreatedAt);
    }

    [Fact]
    public async Task HandleAsync_NoItemId_HidesCommentsOnOthersPrivateItems()
    {
        Category category = VisibilitySeed.AddCategory(DbContext);
        Item publicItem = VisibilitySeed.AddItem(DbContext, category, "owner", false);
        Item privateItem = VisibilitySeed.AddItem(DbContext, category, "owner", true);
        VisibilitySeed.AddComment(DbContext, publicItem);
        VisibilitySeed.AddComment(DbContext, privateItem);
        await DbContext.SaveChangesAsync();

        (await IdsAsync(new GetComments.QueryRequest(null), FakeUserContext.Anonymous))
            .Should().BeEquivalentTo(new[] { publicItem.Id });
        (await IdsAsync(new GetComments.QueryRequest(null), FakeUserContext.User("other")))
            .Should().BeEquivalentTo(new[] { publicItem.Id });
        (await IdsAsync(new GetComments.QueryRequest(null), FakeUserContext.User("owner")))
            .Should().BeEquivalentTo(new[] { publicItem.Id, privateItem.Id });
        (await IdsAsync(new GetComments.QueryRequest(null), FakeUserContext.Admin()))
            .Should().BeEquivalentTo(new[] { publicItem.Id, privateItem.Id });
    }

    [Fact]
    public async Task HandleAsync_EmptyGuidItemId_IsTreatedAsMissingAndFiltered()
    {
        Category category = VisibilitySeed.AddCategory(DbContext);
        Item publicItem = VisibilitySeed.AddItem(DbContext, category, "owner", false);
        Item privateItem = VisibilitySeed.AddItem(DbContext, category, "owner", true);
        VisibilitySeed.AddComment(DbContext, publicItem);
        VisibilitySeed.AddComment(DbContext, privateItem);
        await DbContext.SaveChangesAsync();

        (await IdsAsync(new GetComments.QueryRequest(Guid.Empty), FakeUserContext.Anonymous))
            .Should().BeEquivalentTo(new[] { publicItem.Id });
    }

    [Fact]
    public async Task HandleAsync_WithItemId_PrivateOrMissingItem_ReturnsNotFoundUnlessAccessible()
    {
        Category category = VisibilitySeed.AddCategory(DbContext);
        Item privateItem = VisibilitySeed.AddItem(DbContext, category, "owner", true);
        VisibilitySeed.AddComment(DbContext, privateItem);
        await DbContext.SaveChangesAsync();

        foreach (Guid id in new[] { privateItem.Id, Guid.NewGuid() })
        {
            Result<GetComments.Response> denied = await GetComments.HandleAsync(
                new GetComments.QueryRequest(id), DbContext, FakeUserContext.Anonymous, CancellationToken.None);
            denied.IsFailure.Should().BeTrue();
            denied.Error.Type.Should().Be(ErrorType.NotFound);
        }

        (await IdsAsync(new GetComments.QueryRequest(privateItem.Id), FakeUserContext.User("owner")))
            .Should().BeEquivalentTo(new[] { privateItem.Id });
        (await IdsAsync(new GetComments.QueryRequest(privateItem.Id), FakeUserContext.Admin()))
            .Should().BeEquivalentTo(new[] { privateItem.Id });
    }

    // AC 2.5.1 (#904): one page, newest first, with the visibility-filtered total.

    private async Task<(Item Item, List<Comment> NewestFirst)> SeedCommentsAsync(int count)
    {
        Category category = VisibilitySeed.AddCategory(DbContext);
        Item item = VisibilitySeed.AddItem(DbContext, category, "owner", false);
        DateTime start = new(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        List<Comment> comments = Enumerable.Range(0, count)
            .Select(i => new Comment
            {
                Id = Guid.NewGuid(), ItemId = item.Id, Text = $"Comment {i}", CreatedBy = "user", CreatedAt = start.AddMinutes(i)
            })
            .ToList();
        DbContext.Comments.AddRange(comments);
        await DbContext.SaveChangesAsync();
        return (item, comments.AsEnumerable().Reverse().ToList());
    }

    private async Task<GetComments.Response> PageAsync(GetComments.QueryRequest request) =>
        (await GetComments.HandleAsync(request, DbContext, FakeUserContext.Anonymous, CancellationToken.None)).Value;

    [Fact]
    public async Task HandleAsync_ReturnsOnePageOfFiftyNewestFirstWithTheTotal()
    {
        (Item item, List<Comment> expected) = await SeedCommentsAsync(55);

        GetComments.Response first = await PageAsync(new GetComments.QueryRequest(item.Id));
        GetComments.Response second = await PageAsync(new GetComments.QueryRequest(item.Id, Page: 2));

        (first.TotalCount, first.Page, first.PageSize).Should().Be((55, 1, 50));
        first.Comments.Select(c => c.Text).Should().Equal(expected.Take(50).Select(c => c.Text));
        second.Comments.Select(c => c.Text).Should().Equal(expected.Skip(50).Select(c => c.Text));
        second.TotalCount.Should().Be(55);
    }

    [Theory]
    [InlineData(3, 50)]
    [InlineData(2147483647, 100)]
    public async Task HandleAsync_PageBeyondTheEnd_IsEmptyWithTheTotal(int page, int pageSize)
    {
        (Item item, _) = await SeedCommentsAsync(3);

        GetComments.Response response = await PageAsync(new GetComments.QueryRequest(item.Id, page, pageSize));

        response.Comments.Should().BeEmpty();
        response.TotalCount.Should().Be(3);
    }

    [Fact]
    public async Task HandleAsync_EqualTimestamps_PageWithoutGapsOrRepeats()
    {
        (Item item, List<Comment> comments) = await SeedCommentsAsync(5);
        comments.ForEach(c => c.CreatedAt = comments[0].CreatedAt);
        await DbContext.SaveChangesAsync();

        List<string> seen = [];
        for (int page = 1; page <= 3; page++)
        {
            seen.AddRange((await PageAsync(new GetComments.QueryRequest(item.Id, page, 2))).Comments.Select(c => c.Id));
        }

        seen.Should().OnlyHaveUniqueItems().And.HaveCount(5);
    }

    [Fact]
    public async Task HandleAsync_TotalCount_ExcludesCommentsTheCallerCannotSee()
    {
        Category category = VisibilitySeed.AddCategory(DbContext);
        Item publicItem = VisibilitySeed.AddItem(DbContext, category, "owner", false);
        Item privateItem = VisibilitySeed.AddItem(DbContext, category, "owner", true);
        VisibilitySeed.AddComment(DbContext, publicItem);
        VisibilitySeed.AddComment(DbContext, privateItem);
        await DbContext.SaveChangesAsync();

        (await PageAsync(new GetComments.QueryRequest(null))).TotalCount.Should().Be(1);
    }

    [Theory]
    [InlineData("comments", HttpStatusCode.OK)]
    [InlineData("comments?page=2147483647&pageSize=100", HttpStatusCode.OK)]
    [InlineData("comments?page=0", HttpStatusCode.BadRequest)]
    [InlineData("comments?pageSize=0", HttpStatusCode.BadRequest)]
    [InlineData("comments?pageSize=101", HttpStatusCode.BadRequest)]
    [InlineData("comments?page=2147483648", HttpStatusCode.BadRequest)]
    public async Task Get_OverHttp_ValidatesPaging(string path, HttpStatusCode expected)
    {
        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services => new GetComments.FeatureRegistration().AddToServiceCollection(services, new ConfigurationBuilder().Build()),
            app => new GetComments.Endpoint().MapEndpoint(app));

        using HttpResponseMessage response = await host.Client.GetAsync(path);

        response.StatusCode.Should().Be(expected, await response.Content.ReadAsStringAsync());
    }

    private async Task<List<Guid>> IdsAsync(GetComments.QueryRequest request, FakeUserContext user)
    {
        Result<GetComments.Response> result = await GetComments.HandleAsync(request, DbContext, user, CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        return result.Value.Comments.Select(c => c.ItemId).ToList();
    }

    private async Task<Item> CreateItemWithCategoryAsync(
        Guid itemId,
        string categoryName,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string explanation,
        bool isPrivate,
        string createdBy)
    {
        // Create or get category
        // Note: Category names are unique (unique constraint on Name), so we check by name only
        Category? category = await DbContext.Categories
            .FirstOrDefaultAsync(c => c.Name == categoryName);
        
        if (category is null)
        {
            category = new Category
            {
                Id = Guid.NewGuid(),
                Name = categoryName,
                IsPrivate = isPrivate,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };
            DbContext.Categories.Add(category);
            await DbContext.SaveChangesAsync();
        }

        // Create item
        Item item = new Item
        {
            Id = itemId,
            IsPrivate = isPrivate,
            Question = question,
            CorrectAnswer = correctAnswer,
            IncorrectAnswers = incorrectAnswers,
            Explanation = explanation,
            FuzzySignature = question == "Question 1" ? "ABC" : "DEF",
            FuzzyBucket = question == "Question 1" ? 1 : 2,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            CategoryId = category.Id
        };

        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();

        return item;
    }
}

