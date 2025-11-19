using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.ReviewBoard;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.ReviewBoard;

public sealed class GetReviewBoardItemsTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;

    public GetReviewBoardItemsTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
    }

    [Fact]
    public async Task HandleAsync_NoItemsReadyForReview_ReturnsEmptyList()
    {
        // Arrange
        Item item = new Item
        {
            Id = Guid.NewGuid(),
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

        // Act
        Result<GetReviewBoardItems.Response> result = await GetReviewBoardItems.HandleAsync(
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_ItemsReadyForReview_ReturnsOnlyThoseItems()
    {
        // Arrange
        Item readyItem1 = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            ReadyForReview = true,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow.AddDays(-2)
        };

        Item readyItem2 = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            ReadyForReview = true,
            Question = "What is the capital of Spain?",
            CorrectAnswer = "Madrid",
            IncorrectAnswers = new List<string> { "Barcelona" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        Item notReadyItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            ReadyForReview = false,
            Question = "What is the capital of Italy?",
            CorrectAnswer = "Rome",
            IncorrectAnswers = new List<string> { "Milan" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(readyItem1);
        _dbContext.Items.Add(readyItem2);
        _dbContext.Items.Add(notReadyItem);
        await _dbContext.SaveChangesAsync();

        // Act
        Result<GetReviewBoardItems.Response> result = await GetReviewBoardItems.HandleAsync(
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.Should().Contain(i => i.Id == readyItem1.Id.ToString());
        result.Value.Items.Should().Contain(i => i.Id == readyItem2.Id.ToString());
        result.Value.Items.Should().NotContain(i => i.Id == notReadyItem.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_ReturnsItemsOrderedByCreatedAtDescending()
    {
        // Arrange
        DateTime baseTime = DateTime.UtcNow;

        Item olderItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            ReadyForReview = true,
            Question = "Question 1?",
            CorrectAnswer = "Answer 1",
            IncorrectAnswers = new List<string> { "Wrong" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = baseTime.AddDays(-2)
        };

        Item newerItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            ReadyForReview = true,
            Question = "Question 2?",
            CorrectAnswer = "Answer 2",
            IncorrectAnswers = new List<string> { "Wrong" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = baseTime.AddDays(-1)
        };

        _dbContext.Items.Add(olderItem);
        _dbContext.Items.Add(newerItem);
        await _dbContext.SaveChangesAsync();

        // Act
        Result<GetReviewBoardItems.Response> result = await GetReviewBoardItems.HandleAsync(
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items[0].Id.Should().Be(newerItem.Id.ToString()); // Newer first
        result.Value.Items[1].Id.Should().Be(olderItem.Id.ToString());
    }

    public void Dispose()
    {
        _dbContext?.Dispose();
    }
}

