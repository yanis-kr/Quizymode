using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.ReviewBoard;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.ReviewBoard;

public sealed class ApproveItemTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;

    public ApproveItemTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
    }

    [Fact]
    public async Task HandleAsync_ValidItem_ApprovesAndMakesPublic()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = new Item
        {
            Id = itemId,
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            ReadyForReview = true,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

        // Act
        Result<ApproveItem.Response> result = await ApproveItem.HandleAsync(
            itemId,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Id.Should().Be(itemId.ToString());
        result.Value.IsPrivate.Should().BeFalse();

        Item? updatedItem = await _dbContext.Items.FindAsync([itemId]);
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
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Item.NotFound");
    }

    public void Dispose()
    {
        _dbContext?.Dispose();
    }
}

