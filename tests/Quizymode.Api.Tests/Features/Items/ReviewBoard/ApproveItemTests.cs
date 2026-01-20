using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features.Items.ReviewBoard;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.ReviewBoard;

public sealed class ApproveItemTests : DatabaseTestFixture
{

    [Fact]
    public async Task HandleAsync_ValidItem_ApprovesAndMakesPublic()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = await CreateItemWithCategoryAsync(
            itemId, "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon", "Marseille" }, "Test", true, "test");
        item.ReadyForReview = true;
        await DbContext.SaveChangesAsync();

        // Act
        Result<ApproveItem.Response> result = await ApproveItem.HandleAsync(
            itemId,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Id.Should().Be(itemId.ToString());
        result.Value.IsPrivate.Should().BeFalse();

        Item? updatedItem = await DbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.IsPrivate.Should().BeFalse();
        updatedItem.ReadyForReview.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_NonExistentItem_ReturnsNotFound()
    {
        // Arrange
        Guid nonExistentId = Guid.NewGuid();

        // Act
        Result<ApproveItem.Response> result = await ApproveItem.HandleAsync(
            nonExistentId,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Item.NotFound");
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
            FuzzySignature = "ABC",
            FuzzyBucket = 1,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            CategoryId = category.Id
        };

        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();

        return item;
    }

    public void Dispose()
    {
        DbContext?.Dispose();
    }
}

