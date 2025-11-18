using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Update;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.Update;

public sealed class UpdateItemTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ISimHashService _simHashService;

    public UpdateItemTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _simHashService = new SimHashService();
    }

    [Fact]
    public async Task HandleAsync_ValidRequest_UpdatesItem()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = new Item
        {
            Id = itemId,
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Old explanation",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

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
            _dbContext,
            _simHashService,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Explanation.Should().Be("New explanation");
        result.Value.IncorrectAnswers.Should().HaveCount(2);
        result.Value.IncorrectAnswers.Should().Contain("Lyon");
        result.Value.IncorrectAnswers.Should().Contain("Marseille");

        Item? updatedItem = await _dbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.Explanation.Should().Be("New explanation");
        updatedItem.IncorrectAnswers.Should().HaveCount(2);
    }

    [Fact]
    public async Task HandleAsync_UpdatesFuzzySignature()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = new Item
        {
            Id = itemId,
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            FuzzySignature = "OLD_SIGNATURE",
            FuzzyBucket = 0,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

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
            _dbContext,
            _simHashService,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();

        Item? updatedItem = await _dbContext.Items.FindAsync([itemId]);
        updatedItem.Should().NotBeNull();
        updatedItem!.FuzzySignature.Should().NotBe("OLD_SIGNATURE");
        updatedItem.FuzzySignature.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task HandleAsync_UpdatesReadyForReview()
    {
        // Arrange
        Guid itemId = Guid.NewGuid();
        Item item = new Item
        {
            Id = itemId,
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            ReadyForReview = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

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
            _dbContext,
            _simHashService,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();

        Item? updatedItem = await _dbContext.Items.FindAsync([itemId]);
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
            _dbContext,
            _simHashService,
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
            _dbContext,
            _simHashService,
            CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Item.NotFound");
    }

    public void Dispose()
    {
        _dbContext?.Dispose();
    }
}

