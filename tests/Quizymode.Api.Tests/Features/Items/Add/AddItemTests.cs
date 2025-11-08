using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;
using AddItemHandler = Quizymode.Api.Features.Items.Add.AddItemHandler;

namespace Quizymode.Api.Tests.Features.Items.Add;

public sealed class AddItemTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ISimHashService _simHashService;

    public AddItemTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _simHashService = new SimHashService();
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_CreatesItem()
    {
        // Arrange
        AddItem.Request request = new(
            CategoryId: "geography",
            SubcategoryId: "europe",
            Visibility: "global",
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille", "Nice" },
            Explanation: "Paris is the capital of France");

        // Act
        Result<AddItem.Response> result = await AddItemHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Question.Should().Be(request.Question);
        result.Value.CorrectAnswer.Should().Be(request.CorrectAnswer);

        Item? item = await _dbContext.Items.FirstOrDefaultAsync(i => i.Question == request.Question);
        item.Should().NotBeNull();
        item!.Question.Should().Be(request.Question);
    }

    [Fact]
    public async Task HandleAsync_DuplicateQuestion_AllowsDuplicate()
    {
        // Note: AddItem doesn't check for duplicates - it's a feature that allows duplicates
        // If duplicate checking is needed, it should be done at the business logic level
        
        // Arrange
        Item existingItem = new Item
        {
            Id = Guid.NewGuid(),
            CategoryId = "geography",
            SubcategoryId = "europe",
            Visibility = "global",
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon", "Marseille" },
            Explanation = "Existing item",
            FuzzySignature = _simHashService.ComputeSimHash("What is the capital of France? Paris Lyon Marseille"),
            FuzzyBucket = _simHashService.GetFuzzyBucket(_simHashService.ComputeSimHash("What is the capital of France? Paris Lyon Marseille")),
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(existingItem);
        await _dbContext.SaveChangesAsync();

        AddItem.Request request = new(
            CategoryId: "geography",
            SubcategoryId: "europe",
            Visibility: "global",
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon", "Marseille", "Nice" },
            Explanation: "Paris is the capital of France");

        // Act
        Result<AddItem.Response> result = await AddItemHandler.HandleAsync(
            request,
            _dbContext,
            _simHashService,
            CancellationToken.None);

        // Assert - AddItem allows duplicates, so it should succeed
        result.IsSuccess.Should().BeTrue();
        
        int itemCount = await _dbContext.Items.CountAsync();
        itemCount.Should().Be(2); // Original + new duplicate
    }

    [Fact]
    public void Validator_EmptyCategoryId_ReturnsError()
    {
        // Arrange
        AddItem.Request request = new(
            CategoryId: "",
            SubcategoryId: "europe",
            Visibility: "global",
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon" },
            Explanation: "");

        AddItem.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "CategoryId");
    }

    [Fact]
    public void Validator_InvalidVisibility_ReturnsError()
    {
        // Arrange
        AddItem.Request request = new(
            CategoryId: "geography",
            SubcategoryId: "europe",
            Visibility: "invalid",
            Question: "What is the capital of France?",
            CorrectAnswer: "Paris",
            IncorrectAnswers: new List<string> { "Lyon" },
            Explanation: "");

        AddItem.Validator validator = new();

        // Act
        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Visibility");
    }

    [Fact]
    public void Validator_TooManyIncorrectAnswers_ReturnsError()
    {
        // Arrange
        AddItem.Request request = new(
            CategoryId: "geography",
            SubcategoryId: "europe",
            Visibility: "global",
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

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}

