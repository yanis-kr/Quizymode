using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
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
            NullLogger.Instance,
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
            NullLogger.Instance,
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
            NullLogger.Instance,
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
            NullLogger.Instance,
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
            NullLogger.Instance,
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
            NullLogger.Instance,
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
            NullLogger.Instance,
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

    [Fact]
    public void Validator_NullKeywords_ReturnsKeywordsRequiredError()
    {
        AddItemsBulk.Request request = new(
            IsPrivate: false, Category: "geography", Keyword1: "capitals", Keyword2: "europe",
            Keywords: null!, Items: new List<AddItemsBulk.ItemRequest>());
        AddItemsBulk.Validator validator = new(_userContextMock.Object);

        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Where(e => e.PropertyName == "Keywords").Should().ContainSingle()
            .Which.ErrorMessage.Should().Be("Keywords list is required");
    }

    [Fact]
    public void Validator_NullItems_ReturnsItemsRequiredError()
    {
        AddItemsBulk.Request request = new(
            IsPrivate: false, Category: "geography", Keyword1: "capitals", Keyword2: "europe",
            Keywords: new List<AddItemsBulk.KeywordRequest>(), Items: null!);
        AddItemsBulk.Validator validator = new(_userContextMock.Object);

        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "Items is required");
        result.Errors.Should().NotContain(e => e.ErrorMessage == "At least one item is required");
    }

    [Fact]
    public void ItemValidator_NullIncorrectAnswersWithSpeech_ReturnsErrorsWithoutThrowing()
    {
        AddItemsBulk.ItemRequest item = new(
            Question: "Q", CorrectAnswer: "A", IncorrectAnswers: null!, Explanation: "",
            IncorrectAnswerSpeech: new Dictionary<int, ItemSpeechSupport> { [0] = new ItemSpeechSupport { Pronunciation = "pron" } });
        AddItemsBulk.ItemRequestValidator validator = new();

        FluentValidation.Results.ValidationResult result = validator.Validate(item);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "IncorrectAnswers is required");
    }

    [Fact]
    public void Validator_EmptyKeywords_IsAllowed()
    {
        AddItemsBulk.Request request = new(
            IsPrivate: false, Category: "geography", Keyword1: "capitals", Keyword2: "europe",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: new List<AddItemsBulk.ItemRequest> { new("Q?", "A", new List<string> { "B" }, "") });
        AddItemsBulk.Validator validator = new(_userContextMock.Object);

        validator.Validate(request).Errors.Should().NotContain(e => e.PropertyName == "Keywords");
    }

    [Fact]
    public void Validator_TooManyKeywords_ReturnsCountError()
    {
        List<AddItemsBulk.KeywordRequest> keywords = Enumerable.Range(1, 51)
            .Select(i => new AddItemsBulk.KeywordRequest($"kw{i}", false)).ToList();
        AddItemsBulk.Request request = new(
            IsPrivate: false, Category: "geography", Keyword1: "capitals", Keyword2: "europe",
            Keywords: keywords, Items: new List<AddItemsBulk.ItemRequest>());
        AddItemsBulk.Validator validator = new(_userContextMock.Object);

        validator.Validate(request).Errors.Should()
            .Contain(e => e.ErrorMessage == "Cannot assign more than 50 default keywords");
    }

    [Fact]
    public async Task HandleAsync_UnexpectedException_ReturnsGenericDescriptionAndKeepsCode()
    {
        Mock<IUserContext> noUser = new();
        noUser.Setup(x => x.UserId).Returns((string?)null);
        AddItemsBulk.Request request = new(
            IsPrivate: false, Category: "geography", Keyword1: "capitals", Keyword2: "europe",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: new List<AddItemsBulk.ItemRequest> { new("Q?", "A", new List<string> { "B" }, "") });

        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            DbContext,
            SimHashService,
            noUser.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
            _auditServiceMock.Object,
            NullLogger.Instance,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Items.BulkCreateFailed");
        result.Error.Description.Should().Be("Failed to create items.");
        result.Error.Description.Should().NotContain("User ID is required");
        result.Error.Exception.Should().NotBeNull();
    }

    private const string Secret = "secret-internal-detail-281";

    private static AddItemsBulk.Request OneItemRequest() => new(
        IsPrivate: false, Category: "geography", Keyword1: "capitals", Keyword2: "europe",
        Keywords: new List<AddItemsBulk.KeywordRequest>(),
        Items: new List<AddItemsBulk.ItemRequest> { new("What is the capital of France?", "Paris", new List<string> { "Lyon" }, "") });

    private async Task<(Result<AddItemsBulk.Response> Result, CapturingLoggerProvider Logs)> RunAsync(ISimHashService simHash)
    {
        CapturingLoggerProvider logs = new();
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            OneItemRequest(),
            DbContext,
            simHash,
            _userContextMock.Object,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
            _auditServiceMock.Object,
            logs.CreateLogger("test"),
            CancellationToken.None);
        return (result, logs);
    }

    [Fact]
    public async Task HandleAsync_ItemProcessingThrows_ItemErrorIsGenericAndExceptionLoggedOnce()
    {
        await EnsureGeographyPublicWithNavAsync("test-user");
        Mock<ISimHashService> simHash = new();
        simHash.Setup(s => s.ComputeSimHash(It.IsAny<string>())).Throws(new InvalidOperationException(Secret));

        (Result<AddItemsBulk.Response> result, CapturingLoggerProvider logs) = await RunAsync(simHash.Object);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Errors.Should().ContainSingle().Which.ErrorMessage.Should().Be("Failed to process item.");
        result.Value.Errors[0].ErrorMessage.Should().NotContain(Secret);
        logs.Entries.Where(e => e.Level == LogLevel.Error).Should().ContainSingle()
            .Which.Exception!.Message.Should().Be(Secret);
    }

    [Fact]
    public async Task HandleAsync_DuplicateCheckThrows_ItemErrorIsGenericAndExceptionLoggedOnce()
    {
        await EnsureGeographyPublicWithNavAsync("test-user");
        Mock<ISimHashService> simHash = new();
        simHash.Setup(s => s.ComputeSimHash(It.IsAny<string>())).Returns("sig");
        simHash.Setup(s => s.GetFuzzyBucket(It.IsAny<string>())).Returns(() =>
        {
            // Break the duplicate-check query: the Items table no longer exists under its name.
            DbContext.Database.ExecuteSqlRaw("ALTER TABLE \"Items\" RENAME TO \"Items_gone\"");
            return 1;
        });

        (Result<AddItemsBulk.Response> result, CapturingLoggerProvider logs) = await RunAsync(simHash.Object);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Errors.Should().ContainSingle().Which.ErrorMessage.Should().Be("Unable to check for duplicates.");
        result.Value.Errors[0].ErrorMessage.Should().NotContain("Items");
        logs.Entries.Where(e => e.Level == LogLevel.Error).Should().ContainSingle()
            .Which.Exception.Should().NotBeNull();
    }
}
