using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Ratings;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Ratings;

public sealed class GetRatingsTests : DatabaseTestFixture
{

    [Fact]
    public async Task HandleAsync_NoRatings_ReturnsZeroCountAndNullAverage()
    {
        // Arrange
        GetRatings.QueryRequest request = new(null);

        // Act
        Result<GetRatings.Response> result = await GetRatings.HandleAsync(
            request,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Stats.Count.Should().Be(0);
        result.Value.Stats.AverageStars.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_WithRatings_ReturnsCountAndAverage()
    {
        // Arrange
        Item item = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        DbContext.Ratings.AddRange(
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 5, CreatedBy = "user1", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 4, CreatedBy = "user2", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 3, CreatedBy = "user3", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = null, CreatedBy = "user4", CreatedAt = DateTime.UtcNow } // Null rating should not be counted
        );

        await DbContext.SaveChangesAsync();

        GetRatings.QueryRequest request = new(item.Id);

        // Act
        Result<GetRatings.Response> result = await GetRatings.HandleAsync(
            request,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Stats.Count.Should().Be(3); // Only ratings with stars
        result.Value.Stats.AverageStars.Should().Be(4.0); // (5 + 4 + 3) / 3 = 4.0
        result.Value.Stats.ItemId.Should().Be(item.Id);
    }

    [Fact]
    public async Task HandleAsync_AllRatingsNull_ReturnsZeroCountAndNullAverage()
    {
        // Arrange
        Item item = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        DbContext.Ratings.AddRange(
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = null, CreatedBy = "user1", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = null, CreatedBy = "user2", CreatedAt = DateTime.UtcNow }
        );

        await DbContext.SaveChangesAsync();

        GetRatings.QueryRequest request = new(item.Id);

        // Act
        Result<GetRatings.Response> result = await GetRatings.HandleAsync(
            request,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Stats.Count.Should().Be(0);
        result.Value.Stats.AverageStars.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_NoItemId_ReturnsAllRatings()
    {
        // Arrange
        Item item1 = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "Question 1", "Answer 1",
            new List<string> { "Wrong" }, "", false, "test");

        Item item2 = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "history", "ancient", "Question 2", "Answer 2",
            new List<string> { "Wrong" }, "", false, "test");

        DbContext.Ratings.AddRange(
            new Rating { Id = Guid.NewGuid(), ItemId = item1.Id, Stars = 5, CreatedBy = "user1", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item1.Id, Stars = 4, CreatedBy = "user2", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item2.Id, Stars = 3, CreatedBy = "user3", CreatedAt = DateTime.UtcNow }
        );

        await DbContext.SaveChangesAsync();

        GetRatings.QueryRequest request = new(null);

        // Act
        Result<GetRatings.Response> result = await GetRatings.HandleAsync(
            request,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Stats.Count.Should().Be(3); // All ratings across all items
        result.Value.Stats.AverageStars.Should().Be(4.0); // (5 + 4 + 3) / 3 = 4.0
        result.Value.Stats.ItemId.Should().BeNull();
    }

    private async Task<Item> CreateItemWithCategoriesAsync(
        Guid itemId,
        string categoryName,
        string subcategoryName,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string explanation,
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
            Id = itemId,
            IsPrivate = isPrivate,
            Question = question,
            CorrectAnswer = correctAnswer,
            IncorrectAnswers = incorrectAnswers,
            Explanation = explanation,
            FuzzySignature = question == "Question 1" ? "ABC" : "DEF",
            FuzzyBucket = question == "Question 1" ? 1 : 2,
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

    public void Dispose()
    {
        DbContext.Dispose();
    }
}

