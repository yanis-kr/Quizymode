using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Ratings;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Ratings;

public sealed class GetRatingsTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;

    public GetRatingsTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
    }

    [Fact]
    public async Task HandleAsync_NoRatings_ReturnsZeroCountAndNullAverage()
    {
        // Arrange
        GetRatings.QueryRequest request = new(null);

        // Act
        Result<GetRatings.Response> result = await GetRatings.HandleAsync(
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Stats.Count.Should().Be(0);
        result.Value.Stats.AverageStars.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_WithRatings_ReturnsCountAndAverage()
    {
        // Arrange
        Item item = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "",
            FuzzySignature = "ABC",
            FuzzyBucket = 1,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

        _dbContext.Ratings.AddRange(
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 5, CreatedBy = "user1", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 4, CreatedBy = "user2", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = 3, CreatedBy = "user3", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = null, CreatedBy = "user4", CreatedAt = DateTime.UtcNow } // Null rating should not be counted
        );

        await _dbContext.SaveChangesAsync();

        GetRatings.QueryRequest request = new(item.Id);

        // Act
        Result<GetRatings.Response> result = await GetRatings.HandleAsync(
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Stats.Count.Should().Be(3); // Only ratings with stars
        result.Value.Stats.AverageStars.Should().Be(4.0); // (5 + 4 + 3) / 3 = 4.0
        result.Value.Stats.ItemId.Should().Be(item.Id);
    }

    [Fact]
    public async Task HandleAsync_AllRatingsNull_ReturnsZeroCountAndNullAverage()
    {
        // Arrange
        Item item = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "",
            FuzzySignature = "ABC",
            FuzzyBucket = 1,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(item);
        await _dbContext.SaveChangesAsync();

        _dbContext.Ratings.AddRange(
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = null, CreatedBy = "user1", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item.Id, Stars = null, CreatedBy = "user2", CreatedAt = DateTime.UtcNow }
        );

        await _dbContext.SaveChangesAsync();

        GetRatings.QueryRequest request = new(item.Id);

        // Act
        Result<GetRatings.Response> result = await GetRatings.HandleAsync(
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Stats.Count.Should().Be(0);
        result.Value.Stats.AverageStars.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_NoItemId_ReturnsAllRatings()
    {
        // Arrange
        Item item1 = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "Question 1",
            CorrectAnswer = "Answer 1",
            IncorrectAnswers = new List<string> { "Wrong" },
            Explanation = "",
            FuzzySignature = "ABC",
            FuzzyBucket = 1,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        Item item2 = new Item
        {
            Id = Guid.NewGuid(),
            Category = "history",
            Subcategory = "ancient",
            IsPrivate = false,
            Question = "Question 2",
            CorrectAnswer = "Answer 2",
            IncorrectAnswers = new List<string> { "Wrong" },
            Explanation = "",
            FuzzySignature = "DEF",
            FuzzyBucket = 2,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.AddRange(item1, item2);
        await _dbContext.SaveChangesAsync();

        _dbContext.Ratings.AddRange(
            new Rating { Id = Guid.NewGuid(), ItemId = item1.Id, Stars = 5, CreatedBy = "user1", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item1.Id, Stars = 4, CreatedBy = "user2", CreatedAt = DateTime.UtcNow },
            new Rating { Id = Guid.NewGuid(), ItemId = item2.Id, Stars = 3, CreatedBy = "user3", CreatedAt = DateTime.UtcNow }
        );

        await _dbContext.SaveChangesAsync();

        GetRatings.QueryRequest request = new(null);

        // Act
        Result<GetRatings.Response> result = await GetRatings.HandleAsync(
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Stats.Count.Should().Be(3); // All ratings across all items
        result.Value.Stats.AverageStars.Should().Be(4.0); // (5 + 4 + 3) / 3 = 4.0
        result.Value.Stats.ItemId.Should().BeNull();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}

