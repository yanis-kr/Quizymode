using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Comments;

public sealed class DeleteCommentTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly Mock<IUserContext> _userContextMock;

    public DeleteCommentTests()
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
    public async Task HandleAsync_ExistingComment_DeletesComment()
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

        Comment comment = new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = "Comment to delete",
            CreatedBy = "test-user-id",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Comments.Add(comment);
        await _dbContext.SaveChangesAsync();

        // Act
        Result result = await DeleteComment.HandleAsync(
            comment.Id.ToString(),
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();

        Comment? deletedComment = await _dbContext.Comments.FindAsync(comment.Id);
        deletedComment.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_NonExistentComment_ReturnsNotFound()
    {
        // Arrange
        string nonExistentId = Guid.NewGuid().ToString();

        // Act
        Result result = await DeleteComment.HandleAsync(
            nonExistentId,
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
        string invalidId = "invalid-id";

        // Act
        Result result = await DeleteComment.HandleAsync(
            invalidId,
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

        Comment comment = new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = "Comment to delete",
            CreatedBy = "other-user-id",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Comments.Add(comment);
        await _dbContext.SaveChangesAsync();

        // Act
        Result result = await DeleteComment.HandleAsync(
            comment.Id.ToString(),
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Comment.NotOwner");

        // Comment should still exist
        Comment? existingComment = await _dbContext.Comments.FindAsync(comment.Id);
        existingComment.Should().NotBeNull();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}

