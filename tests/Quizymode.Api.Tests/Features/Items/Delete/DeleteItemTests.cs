using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using DeleteItemHandler = Quizymode.Api.Features.Items.Delete.DeleteItemHandler;

namespace Quizymode.Api.Tests.Features.Items.Delete;

public sealed class DeleteItemTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;
    private readonly Mock<IAuditService> _auditServiceMock;

    public DeleteItemTests()
    {
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns(Guid.NewGuid().ToString());
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _auditServiceMock = new Mock<IAuditService>();
    }

    [Fact]
    public async Task HandleAsync_ExistingItem_DeletesItem()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "", false, _userContextMock.Object.UserId!);

        Guid itemId = item.Id;

        // Act
        Result result = await DeleteItemHandler.HandleAsync(
            itemId.ToString(),
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        
        Item? deletedItem = await DbContext.Items.FindAsync(itemId);
        deletedItem.Should().BeNull();

        // Verify audit logging was called
        _auditServiceMock.Verify(
            x => x.LogAsync(
                AuditAction.ItemDeleted,
                It.IsAny<Guid?>(),
                It.Is<Guid?>(eid => eid == itemId),
                It.IsAny<Dictionary<string, string>?>(),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_NonOwnerPublicItem_ReturnsForbiddenAndKeepsItem()
    {
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Q?", "A", new List<string> { "B" }, "", false, "someone-else");

        Result result = await DeleteItemHandler.HandleAsync(
            item.Id.ToString(), DbContext, _userContextMock.Object, _auditServiceMock.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be(Quizymode.Api.Shared.Helpers.ItemWriteAccess.ForbiddenCode);
        (await DbContext.Items.FindAsync(item.Id)).Should().NotBeNull();
        _auditServiceMock.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task HandleAsync_NonOwnerPrivateItem_ReturnsNotFoundAndKeepsItem()
    {
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Q?", "A", new List<string> { "B" }, "", true, "someone-else");

        Result result = await DeleteItemHandler.HandleAsync(
            item.Id.ToString(), DbContext, _userContextMock.Object, _auditServiceMock.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        (await DbContext.Items.FindAsync(item.Id)).Should().NotBeNull();
    }

    [Fact]
    public async Task HandleAsync_UnresolvedUserIdOnPublicItem_ReturnsForbidden()
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns((string?)null);
        ctx.Setup(x => x.IsAuthenticated).Returns(true);
        ctx.Setup(x => x.IsAdmin).Returns(false);
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Q?", "A", new List<string> { "B" }, "", false, "someone-else");

        Result result = await DeleteItemHandler.HandleAsync(
            item.Id.ToString(), DbContext, ctx.Object, _auditServiceMock.Object, CancellationToken.None);

        result.Error.Code.Should().Be(Quizymode.Api.Shared.Helpers.ItemWriteAccess.ForbiddenCode);
        (await DbContext.Items.FindAsync(item.Id)).Should().NotBeNull();
    }

    [Fact]
    public async Task HandleAsync_NonExistentItem_ReturnsNotFound()
    {
        // Arrange
        string nonExistentId = Guid.NewGuid().ToString();

        // Act
        Result result = await DeleteItemHandler.HandleAsync(
            nonExistentId,
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAsync_InvalidGuid_ReturnsValidationError()
    {
        // Arrange
        string invalidId = "not-a-guid";

        // Act
        Result result = await DeleteItemHandler.HandleAsync(
            invalidId,
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
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
