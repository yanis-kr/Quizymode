using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.GetById;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.GetById;

public sealed class GetItemByIdTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;

    public GetItemByIdTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
    }

    [Fact]
    public async Task HandleAsync_ValidId_ReturnsItem()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = new Item
        {
            Id = itemId,
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Paris is the capital",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

        // Act
        Result<GetItemById.Response> result = await GetItemById.HandleAsync(
            itemId.ToString(),
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Id.Should().Be(itemId.ToString());
        result.Value.Question.Should().Be("What is the capital of France?");
        result.Value.CorrectAnswer.Should().Be("Paris");
    }

    [Fact]
    public async Task HandleAsync_InvalidGuidFormat_ReturnsValidationError()
    {
        // Act
        Result<GetItemById.Response> result = await GetItemById.HandleAsync(
            "invalid-guid",
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Item.InvalidId");
    }

    [Fact]
    public async Task HandleAsync_NonExistentId_ReturnsNotFoundError()
    {
        // Arrange
        Guid nonExistentId = Guid.NewGuid();

        // Act
        Result<GetItemById.Response> result = await GetItemById.HandleAsync(
            nonExistentId.ToString(),
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

