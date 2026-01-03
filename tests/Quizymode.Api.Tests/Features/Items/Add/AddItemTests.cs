using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.Add;

public sealed class AddItemTests : ItemTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;
    private readonly Mock<IAuditService> _auditServiceMock;

    public AddItemTests()
    {
        // Use a Guid string for userId so audit logging works
        string userId = Guid.NewGuid().ToString();
        _userContextMock = CreateUserContextMock(userId);
        _auditServiceMock = new Mock<IAuditService>();
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesItem()
    {
        // Arrange
        AddItem.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille", "Nice" },
            Explanation: "Paris is the capital of France");

        // Act
        Result<AddItem.Response> result = await AddItemHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CategoryResolver,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Question.Should().Be(request.Question);
        result.Value.CorrectAnswer.Should().Be(request.CorrectAnswer);

        Item? item = await DbContext.Items.FirstOrDefaultAsync(i => i.Question == request.Question);
        item.Should().NotBeNull();
        item!.Question.Should().Be(request.Question);

        // Verify audit logging was called
        string expectedUserId = _userContextMock.Object.UserId ?? throw new InvalidOperationException("User ID is required");
        Guid expectedUserIdGuid = Guid.Parse(expectedUserId);
        _auditServiceMock.Verify(
            x => x.LogAsync(
                AuditAction.ItemCreated,
                It.Is<Guid?>(uid => uid.HasValue && uid.Value == expectedUserIdGuid),  // userId
                It.Is<Guid?>(eid => eid.HasValue && eid.Value == item.Id),  // entityId
                It.IsAny<Dictionary<string, string>?>(),  // metadata (optional, not passed)
                It.IsAny<CancellationToken>()),  // cancellationToken
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_DuplicateQuestion_AllowsDuplicate()
    {
        // Note: AddItem doesn't check for duplicates - it's a feature that allows duplicates
        // If duplicate checking is needed, it should be done at the business logic level
        
        // Arrange - Create item with categories using helper
        Item existingItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of France?", "Paris",
            new List<string> { "Lyon", "Marseille" }, "Existing item", false, "test");

        AddItem.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille", "Nice" },
            Explanation: "Paris is the capital of France");

        // Act
        Result<AddItem.Response> result = await AddItemHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CategoryResolver,
            CancellationToken.None);

        // Assert - AddItem allows duplicates, so it should succeed
        result.IsSuccess.Should().BeTrue();
        
        int itemCount = await DbContext.Items.CountAsync();
        itemCount.Should().Be(2); // Original + new duplicate
    }

    [Fact]
    public void Validator_EmptyCategory_ReturnsError()
    {
        // Arrange
        AddItem.Request request = new(
            Category: "",
            IsPrivate: false,
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon" },
            Explanation: "");

        AddItem.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Category");
    }

    [Fact]
    public void Validator_TooManyIncorrectAnswers_ReturnsError()
    {
        // Arrange
        AddItem.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille", "Nice", "Toulouse", "Bordeaux" }, // 5 items
            Explanation: "");

        AddItem.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "IncorrectAnswers");
    }


}
