using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Moq;
using Quizymode.Api.Features.Ratings;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Ratings;

public sealed class AddOrUpdateRatingTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;
    private readonly IMemoryCache _memoryCache;

    public AddOrUpdateRatingTests()
    {
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns("test-user-id");
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _memoryCache = new MemoryCache(new MemoryCacheOptions());
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesRating()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        AddOrUpdateRating.Request request = new(Stars: 5);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            item.Id,
            request,
            DbContext,
            _userContextMock.Object,
            _memoryCache,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.ItemId.Should().Be(item.Id);
        result.Value.Stars.Should().Be(5);
        result.Value.UpdatedAt.Should().BeNull(); // New rating, no update

        Rating? rating = await DbContext.Ratings.FirstOrDefaultAsync(r => r.ItemId == item.Id);
        rating.Should().NotBeNull();
        rating!.Stars.Should().Be(5);
        rating.CreatedBy.Should().Be("test-user-id");
    }

    [Fact]
    public async Task HandleAsync_NullStars_CreatesRatingWithNull()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        AddOrUpdateRating.Request request = new(Stars: null);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            item.Id,
            request,
            DbContext,
            _userContextMock.Object,
            _memoryCache,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Stars.Should().BeNull();

        Rating? rating = await DbContext.Ratings.FirstOrDefaultAsync(r => r.ItemId == item.Id);
        rating.Should().NotBeNull();
        rating!.Stars.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ExistingRating_UpdatesRating()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        Rating existingRating = new Rating
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Stars = 3,
            CreatedBy = "test-user-id",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        DbContext.Ratings.Add(existingRating);
        await DbContext.SaveChangesAsync();

        AddOrUpdateRating.Request request = new(Stars: 5);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            item.Id,
            request,
            DbContext,
            _userContextMock.Object,
            _memoryCache,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Id.Should().Be(existingRating.Id.ToString());
        result.Value.Stars.Should().Be(5);
        result.Value.UpdatedAt.Should().NotBeNull(); // Updated rating

        Rating? updatedRating = await DbContext.Ratings.FindAsync(existingRating.Id);
        updatedRating.Should().NotBeNull();
        updatedRating!.Stars.Should().Be(5);
        updatedRating.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task HandleAsync_NonExistentItem_ReturnsNotFound()
    {
        // Arrange
        AddOrUpdateRating.Request request = new(Stars: 5);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            Guid.NewGuid(),
            request,
            DbContext,
            _userContextMock.Object,
            _memoryCache,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Rating.ItemNotFound");
    }

    [Fact]
    public async Task HandleAsync_MissingUserId_ReturnsValidationError()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        Mock<IUserContext> userContextWithoutUserId = new Mock<IUserContext>();
        userContextWithoutUserId.Setup(x => x.UserId).Returns((string?)null);
        userContextWithoutUserId.Setup(x => x.IsAuthenticated).Returns(true);

        AddOrUpdateRating.Request request = new(Stars: 5);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            item.Id,
            request,
            DbContext,
            userContextWithoutUserId.Object,
            _memoryCache,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Rating.UserIdMissing");
    }

    [Fact]
    public void Validator_InvalidStars_ReturnsError()
    {
        // Arrange
        AddOrUpdateRating.Request request = new(Stars: 6); // Invalid: > 5

        AddOrUpdateRating.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Stars");
    }

    [Fact]
    public void Validator_ZeroStars_ReturnsError()
    {
        // Arrange
        AddOrUpdateRating.Request request = new(Stars: 0); // Invalid: < 1

        AddOrUpdateRating.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Stars");
    }

    [Fact]
    public void Validator_NullStars_IsValid()
    {
        // Arrange
        AddOrUpdateRating.Request request = new(Stars: null);

        AddOrUpdateRating.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_ValidStars_IsValid()
    {
        // Arrange
        AddOrUpdateRating.Request request = new(Stars: 3);

        AddOrUpdateRating.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeTrue();
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

