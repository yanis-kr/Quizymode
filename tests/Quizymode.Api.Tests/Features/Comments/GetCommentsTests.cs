using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
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
        Item item1 = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "Question 1", "Answer 1",
            new List<string> { "Wrong" }, "", false, "test");

        Item item2 = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "history", "ancient", "Question 2", "Answer 2",
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
        Item item1 = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "Question 1", "Answer 1",
            new List<string> { "Wrong" }, "", false, "test");

        Item item2 = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "history", "ancient", "Question 2", "Answer 2",
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
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Comments.Should().HaveCount(2);
        result.Value.Comments.Should().BeInDescendingOrder(c => c.CreatedAt);
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
}

