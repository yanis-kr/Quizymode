using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.ReviewBoard;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.ReviewBoard;

public sealed class GetReviewBoardItemsTests : DatabaseTestFixture
{

    [Fact]
    public async Task HandleAsync_NoItemsReadyForReview_ReturnsEmptyList()
    {
        // Arrange
        Item item = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "Test", false, "test");
        item.ReadyForReview = false;
        await DbContext.SaveChangesAsync();

        // Act
        Result<GetReviewBoardItems.Response> result = await GetReviewBoardItems.HandleAsync(
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_ItemsReadyForReview_ReturnsOnlyThoseItems()
    {
        // Arrange
        Item readyItem1 = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "Test", true, "test");
        readyItem1.ReadyForReview = true;
        readyItem1.CreatedAt = DateTime.UtcNow.AddDays(-2);

        Item readyItem2 = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of Spain?", "Madrid",
            new List<string> { "Barcelona" }, "Test", true, "test");
        readyItem2.ReadyForReview = true;
        readyItem2.CreatedAt = DateTime.UtcNow.AddDays(-1);

        Item notReadyItem = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of Italy?", "Rome",
            new List<string> { "Milan" }, "Test", false, "test");
        notReadyItem.ReadyForReview = false;
        
        await DbContext.SaveChangesAsync();

        // Act
        Result<GetReviewBoardItems.Response> result = await GetReviewBoardItems.HandleAsync(
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.Should().Contain(i => i.Id == readyItem1.Id.ToString());
        result.Value.Items.Should().Contain(i => i.Id == readyItem2.Id.ToString());
        result.Value.Items.Should().NotContain(i => i.Id == notReadyItem.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_ReturnsItemsOrderedByCreatedAtDescending()
    {
        // Arrange
        DateTime baseTime = DateTime.UtcNow;

        Item olderItem = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "Question 1?", "Answer 1",
            new List<string> { "Wrong" }, "Test", true, "test");
        olderItem.ReadyForReview = true;
        olderItem.CreatedAt = baseTime.AddDays(-2);

        Item newerItem = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "Question 2?", "Answer 2",
            new List<string> { "Wrong" }, "Test", true, "test");
        newerItem.ReadyForReview = true;
        newerItem.CreatedAt = baseTime.AddDays(-1);
        
        await DbContext.SaveChangesAsync();

        // Act
        Result<GetReviewBoardItems.Response> result = await GetReviewBoardItems.HandleAsync(
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items[0].Id.Should().Be(newerItem.Id.ToString()); // Newer first
        result.Value.Items[1].Id.Should().Be(olderItem.Id.ToString());
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
            FuzzySignature = "ABC",
            FuzzyBucket = 1,
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
        DbContext?.Dispose();
    }
}

