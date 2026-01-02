using FluentAssertions;
using FluentValidation;
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

public sealed class AddCommentTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;
    private readonly Mock<IAuditService> _auditServiceMock;

    public AddCommentTests()
    {
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns(Guid.NewGuid().ToString());
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _auditServiceMock = new Mock<IAuditService>();
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesComment()
    {
        // Arrange
        string userId = Guid.NewGuid().ToString();
        _userContextMock.Setup(x => x.UserId).Returns(userId);

        Item item = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        AddComment.Request request = new(item.Id, Text: "Great question!");

        // Act
        Result<AddComment.Response> result = await AddComment.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.ItemId.Should().Be(item.Id);
        result.Value.Text.Should().Be("Great question!");
        result.Value.CreatedBy.Should().Be(userId);

        Comment? comment = await DbContext.Comments.FirstOrDefaultAsync(c => c.ItemId == item.Id);
        comment.Should().NotBeNull();
        comment!.Text.Should().Be("Great question!");
        comment.CreatedBy.Should().Be(userId);

        // Verify audit logging was called
        _auditServiceMock.Verify(
            x => x.LogAsync(
                AuditAction.CommentCreated,
                It.IsAny<Guid?>(),
                It.Is<Guid?>(eid => eid == comment.Id),
                It.IsAny<Dictionary<string, string>?>(),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_NonExistentItem_ReturnsNotFound()
    {
        // Arrange
        AddComment.Request request = new(Guid.NewGuid(), Text: "Great question!");

        // Act
        Result<AddComment.Response> result = await AddComment.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
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
        Item item = await CreateItemWithCategoriesAsync(
            Guid.NewGuid(), "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, "test");

        Mock<IUserContext> userContextWithoutUserId = new Mock<IUserContext>();
        userContextWithoutUserId.Setup(x => x.UserId).Returns((string?)null);
        userContextWithoutUserId.Setup(x => x.IsAuthenticated).Returns(true);

        AddComment.Request request = new(item.Id, Text: "Great question!");

        // Act
        Result<AddComment.Response> result = await AddComment.HandleAsync(
            request,
            DbContext,
            userContextWithoutUserId.Object,
            _auditServiceMock.Object,
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

