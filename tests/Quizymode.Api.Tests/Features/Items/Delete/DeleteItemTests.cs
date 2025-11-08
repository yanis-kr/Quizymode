using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Delete;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;
using DeleteItemHandler = Quizymode.Api.Features.Items.Delete.DeleteItemHandler;

namespace Quizymode.Api.Tests.Features.Items.Delete;

public sealed class DeleteItemTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;

    public DeleteItemTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
    }

    [Fact]
    public async Task HandleAsync_ExistingItem_DeletesItem()
    {
        // Arrange
        Item item = new Item
        {
            Id = Guid.NewGuid(),
            CategoryId = "geography",
            SubcategoryId = "europe",
            Visibility = "global",
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "",
            FuzzySignature = "ABC",
            FuzzyBucket = 1,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

        // Act
        Result result = await DeleteItemHandler.HandleAsync(item.Id.ToString(), _dbContext, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        
        Item? deletedItem = await _dbContext.Items.FindAsync(item.Id);
        deletedItem.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_NonExistentItem_ReturnsNotFound()
    {
        // Arrange
        string nonExistentId = Guid.NewGuid().ToString();

        // Act
        Result result = await DeleteItemHandler.HandleAsync(nonExistentId, _dbContext, CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAsync_InvalidGuid_ReturnsValidationError()
    {
        // Arrange
        string invalidId = "not-a-guid";

        // Act
        Result result = await DeleteItemHandler.HandleAsync(invalidId, _dbContext, CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}

