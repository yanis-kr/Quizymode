using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.SetVisibility;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.SetVisibility;

public sealed class SetItemVisibilityTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;

    public SetItemVisibilityTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
    }

    [Fact]
    public async Task HandleAsync_ValidId_SetToPrivate()
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
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

        SetItemVisibility.Request request = new(true);

        // Act
        Result<SetItemVisibility.Response> result = await SetItemVisibility.HandleAsync(
            itemId.ToString(),
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsPrivate.Should().BeTrue();

        Item? updatedItem = await _dbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.IsPrivate.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_ValidId_SetToPublic()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = new Item
        {
            Id = itemId,
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

        SetItemVisibility.Request request = new(false);

        // Act
        Result<SetItemVisibility.Response> result = await SetItemVisibility.HandleAsync(
            itemId.ToString(),
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsPrivate.Should().BeFalse();

        Item? updatedItem = await _dbContext.Items.FindAsync([itemId]);
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
            _dbContext,
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

