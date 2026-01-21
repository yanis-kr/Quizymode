using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using AddItemsBulkHandler = Quizymode.Api.Features.Items.AddBulk.AddItemsBulkHandler;

namespace Quizymode.Api.Tests.Features.Items.AddBulk;

public sealed class AddItemsBulkTests : ItemTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;
    private readonly Mock<IAuditService> _auditServiceMock;

    public AddItemsBulkTests()
    {
        _userContextMock = CreateUserContextMock("test-user");
        _auditServiceMock = new Mock<IAuditService>();
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesAllItems()
    {
        // Arrange
        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("geography", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Paris is the capital"),
                new("geography", "What is the capital of Germany?", "Berlin", new List<string> { "Munich", "Hamburg" }, "Berlin is the capital")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            CategoryResolver,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.CreatedCount.Should().Be(2);
        result.Value.TotalRequested.Should().Be(2);
        result.Value.DuplicateCount.Should().Be(0);
        result.Value.FailedCount.Should().Be(0);

        int itemCount = await DbContext.Items.CountAsync();
        itemCount.Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_WithDuplicates_ReturnsPartialSuccess()
    {
        // Arrange - Add existing item with categories
        Item existingItem = await CreateItemWithCategoryAsync(
            "geography",
            "What is the capital of France?",
            "Paris",
            new List<string> { "Lyon", "Marseille" },
            "Existing",
            isPrivate: false,
            createdBy: "test-user");

        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("geography", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate"),
                new("geography", "What is the capital of Germany?", "Berlin", new List<string> { "Munich" }, "New item")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            CategoryResolver,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(1);
        result.Value.DuplicateCount.Should().Be(1);
        result.Value.DuplicateQuestions.Should().Contain("What is the capital of France?");
    }

    [Fact]
    public void Validator_EmptyItemsList_ReturnsError()
    {
        // Arrange
        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>());

        AddItemsBulk.Validator validator = new(_userContextMock.Object);

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Items");
    }

    [Fact]
    public void Validator_TooManyItems_ReturnsError()
    {
        // Arrange
        List<AddItemsBulk.ItemRequest> items = Enumerable.Range(1, 101)
            .Select(i => new AddItemsBulk.ItemRequest(
                "geography",
                $"Question {i}",
                $"Answer {i}",
                new List<string> { "Wrong1" },
                $"Explanation {i}"))
            .ToList();

        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Items: items);

        // Use non-admin user context to test the 100-item limit for regular users
        Mock<IUserContext> nonAdminUserContextMock = new();
        nonAdminUserContextMock.Setup(x => x.UserId).Returns("test-user");
        nonAdminUserContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        nonAdminUserContextMock.Setup(x => x.IsAdmin).Returns(false);

        AddItemsBulk.Validator validator = new(nonAdminUserContextMock.Object);

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Items" && e.ErrorMessage.Contains("100"));
    }

    [Fact]
    public async Task HandleAsync_MixedAcceptedAndRejected_ReturnsCorrectCounts()
    {
        // Arrange - Add existing items
        Item existingItem1 = await CreateItemWithCategoryAsync(
            "geography",
            "What is the capital of France?",
            "Paris",
            new List<string> { "Lyon", "Marseille" },
            "Existing 1",
            isPrivate: false,
            createdBy: "test-user");

        Item existingItem2 = await CreateItemWithCategoryAsync(
            "geography",
            "What is the capital of Germany?",
            "Berlin",
            new List<string> { "Munich", "Hamburg" },
            "Existing 2",
            isPrivate: false,
            createdBy: "test-user");

        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Duplicate 1 - should be rejected
                new("geography", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate 1"),
                // New item - should be accepted
                new("geography", "What is the capital of Italy?", "Rome", new List<string> { "Milan", "Naples" }, "New item"),
                // Duplicate 2 - should be rejected
                new("geography", "What is the capital of Germany?", "Berlin", new List<string> { "Munich", "Hamburg" }, "Duplicate 2"),
                // Another new item - should be accepted
                new("geography", "What is the capital of Spain?", "Madrid", new List<string> { "Barcelona", "Valencia" }, "New item 2")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            CategoryResolver,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.TotalRequested.Should().Be(4);
        result.Value.CreatedCount.Should().Be(2);
        result.Value.DuplicateCount.Should().Be(2);
        result.Value.FailedCount.Should().Be(0);
        result.Value.DuplicateQuestions.Should().Contain("What is the capital of France?");
        result.Value.DuplicateQuestions.Should().Contain("What is the capital of Germany?");
        result.Value.DuplicateQuestions.Should().NotContain("What is the capital of Italy?");
        result.Value.DuplicateQuestions.Should().NotContain("What is the capital of Spain?");
    }

}
