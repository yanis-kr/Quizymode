using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Comments;

public sealed class UpdateCommentTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;

    public UpdateCommentTests()
    {
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns("test-user-id");
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_UpdatesComment()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        Comment existingComment = new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = "Original comment",
            CreatedBy = "test-user-id",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        DbContext.Comments.Add(existingComment);
        await DbContext.SaveChangesAsync();

        UpdateComment.Request request = new(Text: "Updated comment");

        // Act
        Result<UpdateComment.Response> result = await UpdateComment.HandleAsync(
            existingComment.Id.ToString(),
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Id.Should().Be(existingComment.Id.ToString());
        result.Value.Text.Should().Be("Updated comment");
        result.Value.UpdatedAt.Should().NotBeNull();

        Comment? updatedComment = await DbContext.Comments.FindAsync(existingComment.Id);
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
            DbContext,
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
            DbContext,
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
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        Comment existingComment = new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = "Original comment",
            CreatedBy = "other-user-id",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        DbContext.Comments.Add(existingComment);
        await DbContext.SaveChangesAsync();

        UpdateComment.Request request = new(Text: "Updated comment");

        // Act
        Result<UpdateComment.Response> result = await UpdateComment.HandleAsync(
            existingComment.Id.ToString(),
            request,
            DbContext,
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

    public void Dispose()
    {
        DbContext.Dispose();
    }
}

