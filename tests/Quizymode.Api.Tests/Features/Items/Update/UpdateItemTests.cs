using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Update;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.Update;

public sealed class UpdateItemTests : ItemTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;
    private readonly Mock<IAuditService> _auditServiceMock;

    public UpdateItemTests()
    {
        // Use a Guid string for userId so audit logging works
        string userId = Guid.NewGuid().ToString();
        _userContextMock = CreateUserContextMock(userId);
        _auditServiceMock = new Mock<IAuditService>();
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_UpdatesItem()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        string userId = _userContextMock.Object.UserId ?? throw new InvalidOperationException("User ID is required");
        Item item = await CreateItemWithCategoriesAsync(
            itemId, "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "Old explanation", false, userId);

        UpdateItem.Request request = new(
            Category: "geography",
            Subcategory: "europe",
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille" },
            Explanation: "New explanation",
            IsPrivate: false,
            ReadyForReview: null);

        // Act
        Result<UpdateItem.Response> result = await UpdateItem.HandleAsync(
            itemId.ToString(),
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CategoryResolver,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Explanation.Should().Be("New explanation");
        result.Value.IncorrectAnswers.Should().HaveCount(2);
        result.Value.IncorrectAnswers.Should().Contain("Lyon");
        result.Value.IncorrectAnswers.Should().Contain("Marseille");

        Item? updatedItem = await DbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.Explanation.Should().Be("New explanation");
        updatedItem.IncorrectAnswers.Should().HaveCount(2);

        // Verify audit logging was called
        _auditServiceMock.Verify(
            x => x.LogAsync(
                AuditAction.ItemUpdated,
                It.IsAny<Guid?>(),
                It.Is<Guid?>(eid => eid == itemId),
                It.IsAny<Dictionary<string, string>?>(),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_UpdatesFuzzySignature()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        string userId = _userContextMock.Object.UserId ?? throw new InvalidOperationException("User ID is required");
        Item item = await CreateItemWithCategoriesAsync(
            itemId, "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "Test", false, userId);
        
        // Override fuzzy signature for this test
        item.FuzzySignature = "OLD_SIGNATURE";
        item.FuzzyBucket = 0;
        await DbContext.SaveChangesAsync();

        UpdateItem.Request request = new(
            Category: "geography",
            Subcategory: "europe",
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille" },
            Explanation: "Test",
            IsPrivate: false,
            ReadyForReview: null);

        // Act
        Result<UpdateItem.Response> result = await UpdateItem.HandleAsync(
            itemId.ToString(),
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CategoryResolver,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();

        Item? updatedItem = await DbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.FuzzySignature.Should().NotBe("OLD_SIGNATURE");
        updatedItem.FuzzySignature.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task HandleAsync_UpdatesReadyForReview()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        string userId = _userContextMock.Object.UserId ?? throw new InvalidOperationException("User ID is required");
        Item item = await CreateItemWithCategoriesAsync(
            itemId, "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon" }, "Test", false, userId);
        item.ReadyForReview = false;
        await DbContext.SaveChangesAsync();

        UpdateItem.Request request = new(
            Category: "geography",
            Subcategory: "europe",
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon" },
            Explanation: "Test",
            IsPrivate: false,
            ReadyForReview: true);

        // Act
        Result<UpdateItem.Response> result = await UpdateItem.HandleAsync(
            itemId.ToString(),
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CategoryResolver,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();

        Item? updatedItem = await DbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.ReadyForReview.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_InvalidGuidFormat_ReturnsValidationError()
    {
        // Arrange
        UpdateItem.Request request = new(
            Category: "geography",
            Subcategory: "europe",
            Question: "Test?",
            CorrectAnswer: "Answer",
            IncorrectAnswers: new List<string>(),
            Explanation: "Test",
            IsPrivate: false,
            ReadyForReview: null);

        // Act
        Result<UpdateItem.Response> result = await UpdateItem.HandleAsync(
            "invalid-guid",
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CategoryResolver,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Item.InvalidId");
    }

    [Fact]
    public async Task HandleAsync_NonExistentId_ReturnsNotFound()
    {
        // Arrange
        Guid nonExistentId = Guid.NewGuid();
        UpdateItem.Request request = new(
            Category: "geography",
            Subcategory: "europe",
            Question: "Test?",
            CorrectAnswer: "Answer",
            IncorrectAnswers: new List<string>(),
            Explanation: "Test",
            IsPrivate: false,
            ReadyForReview: null);

        // Act
        Result<UpdateItem.Response> result = await UpdateItem.HandleAsync(
            nonExistentId.ToString(),
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CategoryResolver,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Item.NotFound");
    }

}

