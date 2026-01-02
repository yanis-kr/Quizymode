using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.SetVisibility;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.SetVisibility;

public sealed class SetItemVisibilityTests : DatabaseTestFixture
{

    [Fact]
    public async Task HandleAsync_ValidId_SetToPrivate()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = await CreateItemWithCategoriesAsync(
            itemId, "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "Test", false, "test");

        SetItemVisibility.Request request = new(true);

        // Act
        Result<SetItemVisibility.Response> result = await SetItemVisibility.HandleAsync(
            itemId.ToString(),
            request,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsPrivate.Should().BeTrue();

        Item? updatedItem = await DbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.IsPrivate.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_ValidId_SetToPublic()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = await CreateItemWithCategoriesAsync(
            itemId, "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "Test", true, "test");

        SetItemVisibility.Request request = new(false);

        // Act
        Result<SetItemVisibility.Response> result = await SetItemVisibility.HandleAsync(
            itemId.ToString(),
            request,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsPrivate.Should().BeFalse();

        Item? updatedItem = await DbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.IsPrivate.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_InvalidGuidFormat_ReturnsValidationError()
    {
        // Arrange
        SetItemVisibility.Request request = new(false);

        // Act
        Result<SetItemVisibility.Response> result = await SetItemVisibility.HandleAsync(
            "invalid-guid",
            request,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Item.InvalidId");
    }

    [Fact]
    public async Task HandleAsync_NonExistentId_ReturnsNotFound()
    {
        // Arrange
        Guid nonExistentId = Guid.NewGuid();
        SetItemVisibility.Request request = new(false);

        // Act
        Result<SetItemVisibility.Response> result = await SetItemVisibility.HandleAsync(
            nonExistentId.ToString(),
            request,
            DbContext,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Item.NotFound");
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

