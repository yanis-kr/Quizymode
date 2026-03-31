using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Ratings;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Ratings;

public sealed class GetUserRatingTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;

    public GetUserRatingTests()
    {
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns("test-user-id");
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
    }

    [Fact]
    public async Task HandleAsync_UserHasRating_ReturnsRating()
    {
        // Arrange
        Item item = await CreateItemWithRatingAsync(
            Guid.NewGuid(), "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test",
            userId: "test-user-id", stars: 4);

        GetUserRating.QueryRequest request = new(item.Id);

        // Act
        Result<GetUserRating.RatingResponse?> result = await GetUserRating.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value!.Stars.Should().Be(4);
        result.Value.ItemId.Should().Be(item.Id);
    }

    [Fact]
    public async Task HandleAsync_UserHasNoRating_ReturnsNull()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of Germany?", "Berlin",
            new List<string> { "Munich" }, "", false, "test");

        GetUserRating.QueryRequest request = new(item.Id);

        // Act
        Result<GetUserRating.RatingResponse?> result = await GetUserRating.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_MissingUserId_ReturnsValidationError()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of Italy?", "Rome",
            new List<string> { "Milan" }, "", false, "test");

        Mock<IUserContext> userContextWithoutUserId = new Mock<IUserContext>();
        userContextWithoutUserId.Setup(x => x.UserId).Returns((string?)null);
        userContextWithoutUserId.Setup(x => x.IsAuthenticated).Returns(true);

        GetUserRating.QueryRequest request = new(item.Id);

        // Act
        Result<GetUserRating.RatingResponse?> result = await GetUserRating.HandleAsync(
            request,
            DbContext,
            userContextWithoutUserId.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Ratings.UserIdMissing");
    }

    private async Task<Item> CreateItemWithRatingAsync(
        Guid itemId,
        string categoryName,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string explanation,
        bool isPrivate,
        string createdBy,
        string userId,
        int? stars)
    {
        Item item = await CreateItemWithCategoryAsync(
            itemId, categoryName, question, correctAnswer,
            incorrectAnswers, explanation, isPrivate, createdBy);

        Rating rating = new Rating
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Stars = stars,
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow
        };

        DbContext.Ratings.Add(rating);
        await DbContext.SaveChangesAsync();

        return item;
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
}
