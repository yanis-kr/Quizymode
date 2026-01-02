using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.GetRandom;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using GetRandom = Quizymode.Api.Features.Items.GetRandom.GetRandom;

namespace Quizymode.Api.Tests.Features.Items.GetRandom;

public sealed class GetRandomTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;

    public GetRandomTests()
    {
        _userContextMock = new Mock<IUserContext>();
    }

    private async Task<Item> CreateItemWithCategoriesAsync(
        string categoryName,
        string subcategoryName,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        bool isPrivate,
        string createdBy)
    {
        // Create or get categories
        Category? category = await DbContext.Categories
            .FirstOrDefaultAsync(c => c.Depth == 1 && c.Name == categoryName && c.IsPrivate == isPrivate && c.CreatedBy == createdBy);
        
        if (category is null)
        {
            category = new Category
            {
                Id = Guid.NewGuid(),
                Name = categoryName,
                Depth = 1,
                IsPrivate = isPrivate,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };
            DbContext.Categories.Add(category);
            await DbContext.SaveChangesAsync();
        }

        Category? subcategory = await DbContext.Categories
            .FirstOrDefaultAsync(c => c.Depth == 2 && c.Name == subcategoryName && c.IsPrivate == isPrivate && c.CreatedBy == createdBy);
        
        if (subcategory is null)
        {
            subcategory = new Category
            {
                Id = Guid.NewGuid(),
                Name = subcategoryName,
                Depth = 2,
                IsPrivate = isPrivate,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };
            DbContext.Categories.Add(subcategory);
            await DbContext.SaveChangesAsync();
        }

        // Create item
        Item item = new Item
        {
            Id = Guid.NewGuid(),
            IsPrivate = isPrivate,
            Question = question,
            CorrectAnswer = correctAnswer,
            IncorrectAnswers = incorrectAnswers,
            Explanation = "Test",
            FuzzySignature = $"HASH{question}",
            FuzzyBucket = question.GetHashCode() % 256,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow
        };

        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();

        // Add CategoryItems
        DateTime now = DateTime.UtcNow;
        DbContext.CategoryItems.AddRange(
            new CategoryItem { CategoryId = category.Id, ItemId = item.Id, CreatedBy = createdBy, CreatedAt = now },
            new CategoryItem { CategoryId = subcategory.Id, ItemId = item.Id, CreatedBy = createdBy, CreatedAt = now }
        );
        await DbContext.SaveChangesAsync();

        return item;
    }

    [Fact]
    public async Task HandleAsync_NoItems_ReturnsEmptyList()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);
        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_AnonymousUser_ReturnsOnlyPublicItems()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item publicItem = await CreateItemWithCategoriesAsync(
            "geography", "europe", "What is the capital of France?", "Paris", 
            new List<string> { "Lyon" }, isPrivate: false, createdBy: "test");

        Item privateItem = await CreateItemWithCategoriesAsync(
            "geography", "europe", "What is the capital of Spain?", "Madrid", 
            new List<string> { "Barcelona" }, isPrivate: true, createdBy: "test");

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Id.Should().Be(publicItem.Id.ToString());
        result.Value.Items[0].IsPrivate.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_AuthenticatedUser_ReturnsPublicAndOwnPrivateItems()
    {
        // Arrange
        string userId = "user123";
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _userContextMock.Setup(x => x.UserId).Returns(userId);

        Item publicItem = await CreateItemWithCategoriesAsync(
            "geography", "europe", "What is the capital of France?", "Paris", 
            new List<string> { "Lyon" }, isPrivate: false, createdBy: "other");

        Item ownPrivateItem = await CreateItemWithCategoriesAsync(
            "geography", "europe", "What is the capital of Spain?", "Madrid", 
            new List<string> { "Barcelona" }, isPrivate: true, createdBy: userId);

        Item otherPrivateItem = await CreateItemWithCategoriesAsync(
            "geography", "europe", "What is the capital of Italy?", "Rome", 
            new List<string> { "Milan" }, isPrivate: true, createdBy: "other");

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.Should().Contain(i => i.Id == publicItem.Id.ToString());
        result.Value.Items.Should().Contain(i => i.Id == ownPrivateItem.Id.ToString());
        result.Value.Items.Should().NotContain(i => i.Id == otherPrivateItem.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_WithCategoryFilter_ReturnsFilteredItems()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item geographyItem = await CreateItemWithCategoriesAsync(
            "geography", "europe", "What is the capital of France?", "Paris", 
            new List<string> { "Lyon" }, isPrivate: false, createdBy: "test");

        Item historyItem = await CreateItemWithCategoriesAsync(
            "history", "europe", "When did WW2 end?", "1945", 
            new List<string> { "1944" }, isPrivate: false, createdBy: "test");

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new("geography", null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Category.Should().Be("geography");
    }

    [Fact]
    public async Task HandleAsync_WithCategoryAndSubcategoryFilter_ReturnsFilteredItems()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item europeItem = await CreateItemWithCategoriesAsync(
            "geography", "europe", "What is the capital of France?", "Paris", 
            new List<string> { "Lyon" }, isPrivate: false, createdBy: "test");

        Item asiaItem = await CreateItemWithCategoriesAsync(
            "geography", "asia", "What is the capital of Japan?", "Tokyo", 
            new List<string> { "Osaka" }, isPrivate: false, createdBy: "test");

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new("geography", "europe", 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Subcategory.Should().Be("europe");
    }

    [Fact]
    public async Task HandleAsync_CountLimit_RespectsRequestedCount()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        for (int i = 0; i < 20; i++)
        {
            await CreateItemWithCategoriesAsync(
                "geography", "europe", $"Question {i}?", $"Answer {i}", 
                new List<string> { "Wrong" }, isPrivate: false, createdBy: "test");
        }

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, null, 5);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(5);
    }

}

