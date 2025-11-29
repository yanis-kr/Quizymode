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

public sealed class UpdateCommentTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly Mock<IUserContext> _userContextMock;

    public UpdateCommentTests()
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
    public async Task HandleAsync_ValidRequest_UpdatesComment()
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

        Comment existingComment = new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = "Original comment",
            CreatedBy = "test-user-id",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        _dbContext.Comments.Add(existingComment);
        await _dbContext.SaveChangesAsync();

        UpdateComment.Request request = new(Text: "Updated comment");

        // Act
        Result<UpdateComment.Response> result = await UpdateComment.HandleAsync(
            existingComment.Id.ToString(),
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Id.Should().Be(existingComment.Id.ToString());
        result.Value.Text.Should().Be("Updated comment");
        result.Value.UpdatedAt.Should().NotBeNull();

        Comment? updatedComment = await _dbContext.Comments.FindAsync(existingComment.Id);
        updatedComment.Should().NotBeNull();
        updatedComment!.Text.Should().Be("Updated comment");
        updatedComment.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task HandleAsync_NonExistentComment_ReturnsNotFound()
    {
        // Arrange
        UpdateComment.Request request = new(Text: "Updated comment");
        string nonExistentId = Guid.NewGuid().ToString();

        // Act
        Result<UpdateComment.Response> result = await UpdateComment.HandleAsync(
            nonExistentId,
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Comment.NotFound");
    }

    [Fact]
    public async Task HandleAsync_InvalidIdFormat_ReturnsValidationError()
    {
        // Arrange
        UpdateComment.Request request = new(Text: "Updated comment");

        // Act
        Result<UpdateComment.Response> result = await UpdateComment.HandleAsync(
            "invalid-id",
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Comment.InvalidId");
    }

    [Fact]
    public async Task HandleAsync_NotOwner_ReturnsForbidden()
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

        Comment existingComment = new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = "Original comment",
            CreatedBy = "other-user-id",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        _dbContext.Comments.Add(existingComment);
        await _dbContext.SaveChangesAsync();

        UpdateComment.Request request = new(Text: "Updated comment");

        // Act
        Result<UpdateComment.Response> result = await UpdateComment.HandleAsync(
            existingComment.Id.ToString(),
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Comment.NotOwner");
    }

    [Fact]
    public void Validator_EmptyText_ReturnsError()
    {
        // Arrange
        UpdateComment.Request request = new(Text: "");

        UpdateComment.Validator validator = new();

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
        UpdateComment.Request request = new(Text: longText);

        UpdateComment.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Text");
    }

    [Fact]
    public void Validator_ValidRequest_IsValid()
    {
        // Arrange
        UpdateComment.Request request = new(Text: "Valid updated comment");

        UpdateComment.Validator validator = new();

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

