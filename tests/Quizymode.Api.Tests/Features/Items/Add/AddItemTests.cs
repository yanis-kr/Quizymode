using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using AddItemHandler = Quizymode.Api.Features.Items.Add.AddItemHandler;

namespace Quizymode.Api.Tests.Features.Items.Add;

public sealed class AddItemTests : DatabaseTestFixture
{
    private readonly ISimHashService _simHashService;
    private readonly Mock<IUserContext> _userContextMock;
    private readonly Mock<IAuditService> _auditServiceMock;
    private readonly ICategoryResolver _categoryResolver;

    public AddItemTests()
    {
        _simHashService = new SimHashService();
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.UserId).Returns(Guid.NewGuid().ToString());
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _userContextMock.Setup(x => x.IsAdmin).Returns(true);
        _auditServiceMock = new Mock<IAuditService>();
        
        ILogger<CategoryResolver> logger = NullLogger<CategoryResolver>.Instance;
        _categoryResolver = new CategoryResolver(DbContext, logger);
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesItem()
    {
        // Arrange
        AddItem.Request request = new(
            Category: "geography",
            Subcategory: "europe",
            IsPrivate: false,
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille", "Nice" },
            Explanation: "Paris is the capital of France");

        // Act
        Result<AddItem.Response> result = await AddItemHandler.HandleAsync(
            request,
            DbContext,
            _simHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            _categoryResolver,
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
        _auditServiceMock.Verify(
            x => x.LogAsync(
                AuditAction.ItemCreated,
                It.IsAny<Guid?>(),
                It.Is<Guid?>(eid => eid.HasValue && eid.Value == item.Id),
                It.IsAny<Dictionary<string, string>?>(),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_DuplicateQuestion_AllowsDuplicate()
    {
        // Note: AddItem doesn't check for duplicates - it's a feature that allows duplicates
        // If duplicate checking is needed, it should be done at the business logic level
        
        // Arrange - Create item with categories using helper
        Item existingItem = await CreateItemWithCategoriesAsync(
            "geography", "europe", "What is the capital of France?", "Paris",
            new List<string> { "Lyon", "Marseille" }, "Existing item", false, "test");

        AddItem.Request request = new(
            Category: "geography",
            Subcategory: "europe",
            IsPrivate: false,
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille", "Nice" },
            Explanation: "Paris is the capital of France");

        // Act
        Result<AddItem.Response> result = await AddItemHandler.HandleAsync(
            request,
            DbContext,
            _simHashService,
            _userContextMock.Object,
            _auditServiceMock.Object,
            _categoryResolver,
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
            Subcategory: "europe",
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
            Subcategory: "europe",
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

    private async Task<Item> CreateItemWithCategoriesAsync(
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
            Id = Guid.NewGuid(),
            IsPrivate = isPrivate,
            Question = question,
            CorrectAnswer = correctAnswer,
            IncorrectAnswers = incorrectAnswers,
            Explanation = explanation,
            FuzzySignature = _simHashService.ComputeSimHash($"{question} {correctAnswer} {string.Join(" ", incorrectAnswers)}"),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash($"{question} {correctAnswer} {string.Join(" ", incorrectAnswers)}")),
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

}
