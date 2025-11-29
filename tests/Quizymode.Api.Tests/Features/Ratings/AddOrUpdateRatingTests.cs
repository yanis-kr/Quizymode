using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Ratings;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Ratings;

public sealed class AddOrUpdateRatingTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly Mock<IUserContext> _userContextMock;

    public AddOrUpdateRatingTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns("test-user-id");
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesRating()
    {
        // Arrange
        Item item = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
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

        AddOrUpdateRating.Request request = new(item.Id, Stars: 5);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.ItemId.Should().Be(item.Id);
        result.Value.Stars.Should().Be(5);
        result.Value.UpdatedAt.Should().BeNull(); // New rating, no update

        Rating? rating = await _dbContext.Ratings.FirstOrDefaultAsync(r => r.ItemId == item.Id);
        rating.Should().NotBeNull();
        rating!.Stars.Should().Be(5);
        rating.CreatedBy.Should().Be("test-user-id");
    }

    [Fact]
    public async Task HandleAsync_NullStars_CreatesRatingWithNull()
    {
        // Arrange
        Item item = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
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

        AddOrUpdateRating.Request request = new(item.Id, Stars: null);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Stars.Should().BeNull();

        Rating? rating = await _dbContext.Ratings.FirstOrDefaultAsync(r => r.ItemId == item.Id);
        rating.Should().NotBeNull();
        rating!.Stars.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ExistingRating_UpdatesRating()
    {
        // Arrange
        Item item = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
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

        Rating existingRating = new Rating
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Stars = 3,
            CreatedBy = "test-user-id",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        _dbContext.Ratings.Add(existingRating);
        await _dbContext.SaveChangesAsync();

        AddOrUpdateRating.Request request = new(item.Id, Stars: 5);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Id.Should().Be(existingRating.Id.ToString());
        result.Value.Stars.Should().Be(5);
        result.Value.UpdatedAt.Should().NotBeNull(); // Updated rating

        Rating? updatedRating = await _dbContext.Ratings.FindAsync(existingRating.Id);
        updatedRating.Should().NotBeNull();
        updatedRating!.Stars.Should().Be(5);
        updatedRating.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task HandleAsync_NonExistentItem_ReturnsNotFound()
    {
        // Arrange
        AddOrUpdateRating.Request request = new(Guid.NewGuid(), Stars: 5);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
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
        Item item = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
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

        Mock<IUserContext> userContextWithoutUserId = new Mock<IUserContext>();
        userContextWithoutUserId.Setup(x => x.UserId).Returns((string?)null);
        userContextWithoutUserId.Setup(x => x.IsAuthenticated).Returns(true);

        AddOrUpdateRating.Request request = new(item.Id, Stars: 5);

        // Act
        Result<AddOrUpdateRating.Response> result = await AddOrUpdateRating.HandleAsync(
            request,
            _dbContext,
            userContextWithoutUserId.Object,
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
        AddOrUpdateRating.Request request = new(Guid.NewGuid(), Stars: 6); // Invalid: > 5

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
        AddOrUpdateRating.Request request = new(Guid.NewGuid(), Stars: 0); // Invalid: < 1

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
        AddOrUpdateRating.Request request = new(Guid.NewGuid(), Stars: null);

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
        AddOrUpdateRating.Request request = new(Guid.NewGuid(), Stars: 3);

        AddOrUpdateRating.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_EmptyItemId_ReturnsError()
    {
        // Arrange
        AddOrUpdateRating.Request request = new(Guid.Empty, Stars: 5);

        AddOrUpdateRating.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "ItemId");
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}

