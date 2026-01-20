using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Items.GetById;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.GetById;

public sealed class GetItemByIdTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;

    public GetItemByIdTests()
    {
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _userContextMock.Setup(x => x.UserId).Returns("test");
        _userContextMock.Setup(x => x.IsAdmin).Returns(false);
    }

    [Fact]
    public async Task HandleAsync_ValidId_ReturnsItem()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = await CreateItemWithCategoryAsync(
            itemId, "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon", "Marseille" }, "Paris is the capital", false, "test");

        // Act
        Result<GetItemById.Response> result = await GetItemById.HandleAsync(
            itemId.ToString(),
            DbContext,
            _userContextMock.Object,
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
            DbContext,
            _userContextMock.Object,
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
            DbContext,
            _userContextMock.Object,
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
            FuzzySignature = $"HASH{question}",
            FuzzyBucket = question.GetHashCode() % 256,
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

