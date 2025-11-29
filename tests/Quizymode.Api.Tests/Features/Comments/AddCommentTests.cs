using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Comments;

public sealed class AddCommentTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly Mock<IUserContext> _userContextMock;

    public AddCommentTests()
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
    public async Task HandleAsync_ValidRequest_CreatesComment()
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

        AddComment.Request request = new(item.Id, Text: "Great question!");

        // Act
        Result<AddComment.Response> result = await AddComment.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.ItemId.Should().Be(item.Id);
        result.Value.Text.Should().Be("Great question!");
        result.Value.CreatedBy.Should().Be("test-user-id");

        Comment? comment = await _dbContext.Comments.FirstOrDefaultAsync(c => c.ItemId == item.Id);
        comment.Should().NotBeNull();
        comment!.Text.Should().Be("Great question!");
        comment.CreatedBy.Should().Be("test-user-id");
    }

    [Fact]
    public async Task HandleAsync_NonExistentItem_ReturnsNotFound()
    {
        // Arrange
        AddComment.Request request = new(Guid.NewGuid(), Text: "Great question!");

        // Act
        Result<AddComment.Response> result = await AddComment.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Comment.ItemNotFound");
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

        AddComment.Request request = new(item.Id, Text: "Great question!");

        // Act
        Result<AddComment.Response> result = await AddComment.HandleAsync(
            request,
            _dbContext,
            userContextWithoutUserId.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Comment.UserIdMissing");
    }

    [Fact]
    public void Validator_EmptyText_ReturnsError()
    {
        // Arrange
        AddComment.Request request = new(Guid.NewGuid(), Text: "");

        AddComment.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Text");
    }

    [Fact]
    public void Validator_TextTooLong_ReturnsError()
    {
        // Arrange
        string longText = new string('a', 2001); // 2001 characters
        AddComment.Request request = new(Guid.NewGuid(), Text: longText);

        AddComment.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Text");
    }

    [Fact]
    public void Validator_EmptyItemId_ReturnsError()
    {
        // Arrange
        AddComment.Request request = new(Guid.Empty, Text: "Valid text");

        AddComment.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "ItemId");
    }

    [Fact]
    public void Validator_ValidRequest_IsValid()
    {
        // Arrange
        AddComment.Request request = new(Guid.NewGuid(), Text: "Valid comment text");

        AddComment.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}

