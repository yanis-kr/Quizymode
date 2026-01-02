using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Comments;

public sealed class DeleteCommentTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;
    private readonly Mock<IAuditService> _auditServiceMock;

    public DeleteCommentTests()
    {
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns(Guid.NewGuid().ToString());
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _auditServiceMock = new Mock<IAuditService>();
    }

    [Fact]
    public async Task HandleAsync_ExistingComment_DeletesComment()
    {
        // Arrange
        string userId = Guid.NewGuid().ToString();
        _userContextMock.Setup(x => x.UserId).Returns(userId);

        Item item = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        Comment comment = new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = "Comment to delete",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow
        };

        DbContext.Comments.Add(comment);
        await DbContext.SaveChangesAsync();

        Guid commentId = comment.Id;

        // Act
        Result result = await DeleteComment.HandleAsync(
            commentId.ToString(),
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();

        Comment? deletedComment = await DbContext.Comments.FindAsync(commentId);
        deletedComment.Should().BeNull();

        // Verify audit logging was called
        _auditServiceMock.Verify(
            x => x.LogAsync(
                AuditAction.CommentDeleted,
                It.IsAny<Guid?>(),
                It.Is<Guid?>(eid => eid == commentId),
                It.IsAny<Dictionary<string, string>?>(),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_NonExistentComment_ReturnsNotFound()
    {
        // Arrange
        string nonExistentId = Guid.NewGuid().ToString();

        // Act
        Result result = await DeleteComment.HandleAsync(
            nonExistentId,
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
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
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
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
        Item item = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        Comment comment = new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = "Comment to delete",
            CreatedBy = "other-user-id",
            CreatedAt = DateTime.UtcNow
        };

        DbContext.Comments.Add(comment);
        await DbContext.SaveChangesAsync();

        // Act
        Result result = await DeleteComment.HandleAsync(
            comment.Id.ToString(),
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Comment.NotOwner");

        // Comment should still exist
        Comment? existingComment = await DbContext.Comments.FindAsync(comment.Id);
        existingComment.Should().NotBeNull();

        // Verify audit logging was NOT called for failed deletion
        _auditServiceMock.Verify(
            x => x.LogAsync(
                It.IsAny<AuditAction>(),
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<Dictionary<string, string>?>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private async Task<Item> CreateItemWithCategoriesAsync(
        Guid itemId,
        string categoryName,
        string subcategoryName,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string explanation,
        bool isPrivate,
        string createdBy)
    {
        // Create or get categories
        Category? category = await DbContext.Categories
            .FirstOrDefaultAsync(c => c.Depth == 1 && c.Name == categoryName && c.IsPrivate == isPrivate && c.CreatedBy == createdBy);
        
        if (category is null)
        {
            category = new Category
            {
                Id = Guid.NewGuid(),
                Name = categoryName,
                Depth = 1,
                IsPrivate = isPrivate,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };
            DbContext.Categories.Add(category);
            await DbContext.SaveChangesAsync();
        }

        Category? subcategory = await DbContext.Categories
            .FirstOrDefaultAsync(c => c.Depth == 2 && c.Name == subcategoryName && c.IsPrivate == isPrivate && c.CreatedBy == createdBy);
        
        if (subcategory is null)
        {
            subcategory = new Category
            {
                Id = Guid.NewGuid(),
                Name = subcategoryName,
                Depth = 2,
                IsPrivate = isPrivate,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };
            DbContext.Categories.Add(subcategory);
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
            CreatedAt = DateTime.UtcNow
        };

        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();

        // Add CategoryItems
        DateTime now = DateTime.UtcNow;
        DbContext.CategoryItems.AddRange(
            new CategoryItem { CategoryId = category.Id, ItemId = item.Id, CreatedBy = createdBy, CreatedAt = now },
            new CategoryItem { CategoryId = subcategory.Id, ItemId = item.Id, CreatedBy = createdBy, CreatedAt = now }
        );
        await DbContext.SaveChangesAsync();

        return item;
    }

    public void Dispose()
    {
        DbContext.Dispose();
    }
}

