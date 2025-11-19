using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;
using AddItemsBulkHandler = Quizymode.Api.Features.Items.AddBulk.AddItemsBulkHandler;

namespace Quizymode.Api.Tests.Features.Items.AddBulk;

public sealed class AddItemsBulkTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ISimHashService _simHashService;
    private readonly Mock<IUserContext> _userContextMock;

    public AddItemsBulkTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _simHashService = new SimHashService();
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns("test-user");
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesAllItems()
    {
        // Arrange
        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Paris is the capital"),
                new("europe", "What is the capital of Germany?", "Berlin", new List<string> { "Munich", "Hamburg" }, "Berlin is the capital")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.CreatedCount.Should().Be(2);
        result.Value.TotalRequested.Should().Be(2);
        result.Value.DuplicateCount.Should().Be(0);
        result.Value.FailedCount.Should().Be(0);

        int itemCount = await _dbContext.Items.CountAsync();
        itemCount.Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_WithDuplicates_ReturnsPartialSuccess()
    {
        // Arrange - Add existing item
        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing",
            FuzzySignature = _simHashService.ComputeSimHash("What is the capital of France? Paris Lyon Marseille"),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash("What is the capital of France? Paris Lyon Marseille")),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate"),
                new("europe", "What is the capital of Germany?", "Berlin", new List<string> { "Munich" }, "New item")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
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
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>());

        AddItemsBulk.Validator validator = new();

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
                "europe",
                $"Question {i}",
                $"Answer {i}",
                new List<string> { "Wrong1" },
                $"Explanation {i}"))
            .ToList();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: items);

        AddItemsBulk.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Items" && e.ErrorMessage.Contains("100"));
    }

    [Fact]
    public async Task HandleAsync_TransactionRollback_OnFailure()
    {
        // Arrange
        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Lyon" }, "Valid"),
            });

        // Simulate database error by disposing context
        _dbContext.Dispose();

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_ExactDuplicateQuestion_RejectsDuplicate()
    {
        // Arrange - Add existing item with exact question match
        string questionText = "What is the capital of France? Paris Lyon Marseille";
        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing",
            FuzzySignature = _simHashService.ComputeSimHash(questionText),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash(questionText)),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Exact duplicate - should be rejected
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate"),
                // Different question - should be accepted
                new("europe", "What is the capital of Spain?", "Madrid", new List<string> { "Barcelona", "Valencia" }, "New item")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(1);
        result.Value.DuplicateCount.Should().Be(1);
        result.Value.DuplicateQuestions.Should().Contain("What is the capital of France?");
        result.Value.DuplicateQuestions.Should().NotContain("What is the capital of Spain?");
    }

    [Fact]
    public async Task HandleAsync_CaseInsensitiveDuplicate_RejectsDuplicate()
    {
        // Arrange - Add existing item with lowercase question
        string questionText = "what is the capital of france? paris lyon marseille";
        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "what is the capital of france?",
            CorrectAnswer = "paris",
            IncorrectAnswers = new List<string> { "lyon", "marseille" },
            Explanation = "Existing",
            FuzzySignature = _simHashService.ComputeSimHash(questionText),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash(questionText)),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Same question but different case - should be rejected (case-insensitive match)
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(0);
        result.Value.DuplicateCount.Should().Be(1);
        result.Value.DuplicateQuestions.Should().Contain("What is the capital of France?");
    }

    [Fact]
    public async Task HandleAsync_SimilarContentDifferentQuestion_AcceptsAsDifferent()
    {
        // Arrange - Add existing item
        string questionText = "What is the capital of France? Paris Lyon Marseille";
        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing",
            FuzzySignature = _simHashService.ComputeSimHash(questionText),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash(questionText)),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Different question entirely - should be accepted
                new("europe", "Which city is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Different question"),
                // Same question but different answers - should be REJECTED (question match takes precedence)
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Toulouse", "Nice" }, "Different incorrect answers")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(1); // Only the different question is accepted
        result.Value.DuplicateCount.Should().Be(1); // Same question is rejected even with different answers
        result.Value.DuplicateQuestions.Should().Contain("What is the capital of France?");
    }

    [Fact]
    public async Task HandleAsync_SameFuzzySignature_RejectsDuplicate()
    {
        // Arrange - Add existing item
        string questionText = "What is the capital of France? Paris Lyon Marseille";
        string fuzzySignature = _simHashService.ComputeSimHash(questionText);
        int fuzzyBucket = _simHashService.GetFuzzyBucket(fuzzySignature);

        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing",
            FuzzySignature = fuzzySignature,
            FuzzyBucket = fuzzyBucket,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Same fuzzy signature (same question + answers) - should be rejected
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(0);
        result.Value.DuplicateCount.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_DifferentCategory_AcceptsAsDifferent()
    {
        // Arrange - Add existing item in different category
        string questionText = "What is the capital of France? Paris Lyon Marseille";
        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "history", // Different category
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing",
            FuzzySignature = _simHashService.ComputeSimHash(questionText),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash(questionText)),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography", // Different category
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Same question/answers but different category - should be accepted
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Different category")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(1);
        result.Value.DuplicateCount.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_DifferentSubcategory_AcceptsAsDifferent()
    {
        // Arrange - Add existing item
        string questionText = "What is the capital of France? Paris Lyon Marseille";
        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing",
            FuzzySignature = _simHashService.ComputeSimHash(questionText),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash(questionText)),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Same category, same question/answers, but different subcategory - should still be rejected
                // (duplicate check is per category+subcategory combination)
                new("asia", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Different subcategory")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        // Note: The duplicate check filters by category AND subcategory, so different subcategory should allow it
        // But wait, let me check the handler logic again - it checks item.Category == request.Category && item.Subcategory == itemRequest.Subcategory
        // So different subcategory should be accepted!
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(1);
        result.Value.DuplicateCount.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_MinorWhitespaceDifferences_RejectsDuplicate()
    {
        // Arrange - Add existing item
        string questionText = "What is the capital of France? Paris Lyon Marseille";
        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing",
            FuzzySignature = _simHashService.ComputeSimHash(questionText),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash(questionText)),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Same question with extra spaces - SimHash normalizes whitespace, so should match
                // But the exact question match check happens first, so this might pass
                // Actually, the question text comparison is case-insensitive but exact otherwise
                // So whitespace differences in question would pass the question check but might match fuzzy signature
                new("europe", "What  is  the  capital  of  France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Extra spaces")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        // The question text comparison is exact (case-insensitive), so extra spaces would be different
        // But SimHash normalizes whitespace, so fuzzy signature would match
        // The handler checks: question match OR fuzzy signature match
        // So this should be rejected due to fuzzy signature match
        result.IsSuccess.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(0);
        result.Value.DuplicateCount.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_MixedAcceptedAndRejected_ReturnsCorrectCounts()
    {
        // Arrange - Add existing items
        string questionText1 = "What is the capital of France? Paris Lyon Marseille";
        string questionText2 = "What is the capital of Germany? Berlin Munich Hamburg";

        Item existingItem1 = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing 1",
            FuzzySignature = _simHashService.ComputeSimHash(questionText1),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash(questionText1)),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        Item existingItem2 = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of Germany?",
            CorrectAnswer = "Berlin",
            IncorrectAnswers = new List<string> { "Munich", "Hamburg" },
            Explanation = "Existing 2",
            FuzzySignature = _simHashService.ComputeSimHash(questionText2),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash(questionText2)),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem1);
        _dbContext.Items.Add(existingItem2);
        await _dbContext.SaveChangesAsync();

        AddItemsBulk.Request request = new(
            Category: "geography",
            IsPrivate: false,
            Items: new List<AddItemsBulk.ItemRequest>
            {
                // Duplicate 1 - should be rejected
                new("europe", "What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille" }, "Duplicate 1"),
                // New item - should be accepted
                new("europe", "What is the capital of Italy?", "Rome", new List<string> { "Milan", "Naples" }, "New item"),
                // Duplicate 2 - should be rejected
                new("europe", "What is the capital of Germany?", "Berlin", new List<string> { "Munich", "Hamburg" }, "Duplicate 2"),
                // Another new item - should be accepted
                new("europe", "What is the capital of Spain?", "Madrid", new List<string> { "Barcelona", "Valencia" }, "New item 2")
            });

        // Act
        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            _userContextMock.Object,
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

    public void Dispose()
    {
        _dbContext?.Dispose();
    }
}
