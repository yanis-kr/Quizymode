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
        await EnsureGeographyPublicWithNavAsync("test-user");

        var keywords = new List<AddItemsBulk.KeywordRequest> { new("capitals", false), new("europe", false) };
        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: keywords,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Paris is the capital"),
                new("What is the capital of Germany?", "Berlin", new List<string> { "Munich", "Hamburg" }, "Berlin is the capital")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
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

        var keywords = new List<AddItemsBulk.KeywordRequest> { new("capitals", false), new("europe", false) };
        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: keywords,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate"),
                new("What is the capital of Germany?", "Berlin", new List<string> { "Munich" }, "New item")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
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
        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: new List<AddItemsBulk.KeywordRequest> { new("capitals", false), new("europe", false) },
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
                $"Question {i}",
                $"Answer {i}",
                new List<string> { "Wrong1" },
                $"Explanation {i}"))
            .ToList();

        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: new List<AddItemsBulk.KeywordRequest> { new("capitals", false), new("europe", false) },
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

        var keywords = new List<AddItemsBulk.KeywordRequest> { new("capitals", false), new("europe", false) };
        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: keywords,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate 1"),
                new("What is the capital of Italy?", "Rome", new List<string> { "Milan", "Naples" }, "New item"),
                new("What is the capital of Germany?", "Berlin", new List<string> { "Munich", "Hamburg" }, "Duplicate 2"),
                new("What is the capital of Spain?", "Madrid", new List<string> { "Barcelona", "Valencia" }, "New item 2")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
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

    [Fact]
    public async Task HandleAsync_InvalidCategory_DoesNotLeaveDbTransactionOpen()
    {
        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "not-a-real-category-slug",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: [],
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("Q?", "A", new List<string> { "x" }, "e")
            });

        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
            _auditServiceMock.Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        DbContext.Database.CurrentTransaction.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_InvalidNavigation_DoesNotLeaveDbTransactionOpen()
    {
        await EnsureGeographyPublicWithNavAsync("test-user");

        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "not-a-valid-l2-under-capitals",
            Keywords: [],
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("Q?", "A", new List<string> { "x" }, "e")
            });

        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
            _auditServiceMock.Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        DbContext.Database.CurrentTransaction.Should().BeNull();
    }

    // AC 2.2.6.11
    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesItems()
    {
        // Arrange
        await EnsureGeographyPublicWithNavAsync("test-user");

        AddItemsBulk.Request request = new(
            IsPrivate: true,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: [],
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("Q1?", "A1", new List<string> { "W1", "W2", "W3" }, "Exp1")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(1);
        result.Value.CreatedItemIds.Should().HaveCount(1);
    }

    // AC 2.2.6.11
    [Fact]
    public async Task HandleAsync_DuplicateQuestion_SkipsDuplicate()
    {
        // Arrange
        await EnsureGeographyPublicWithNavAsync("test-user");
        Item existingItem = await CreateItemWithCategoryAsync(
            "geography",
            "What is the capital of Greece?",
            "Athens",
            new List<string> { "Thessaloniki" },
            "Existing",
            isPrivate: false,
            createdBy: "test-user");

        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: [],
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("What is the capital of Greece?", "Athens", new List<string> { "Thessaloniki" }, "Duplicate")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            _userContextMock.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
            _auditServiceMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.DuplicateCount.Should().BeGreaterThanOrEqualTo(1);
        result.Value.CreatedCount.Should().Be(0);
    }

    [Fact]
    public void HandleAsync_EmptyKeyword2_ReturnsValidationError()
    {
        // Arrange
        Mock<IUserContext> userContextMock = new();
        userContextMock.Setup(x => x.UserId).Returns("test-user");
        userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        userContextMock.Setup(x => x.IsAdmin).Returns(false);

        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "",
            Keywords: [],
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("Q?", "A", new List<string> { "W1" }, "Exp")
            });

        AddItemsBulk.Validator validator = new(userContextMock.Object);

        // Act
        FluentValidation.Results.ValidationResult validationResult = validator.Validate(request);

        // Assert
        validationResult.IsValid.Should().BeFalse();
        validationResult.Errors.Should().Contain(e => e.PropertyName == "Keyword2");
    }

}
