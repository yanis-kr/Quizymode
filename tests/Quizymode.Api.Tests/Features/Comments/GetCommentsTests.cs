using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.Comments;

public sealed class GetCommentsTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;

    public GetCommentsTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
    }

    [Fact]
    public async Task HandleAsync_NoComments_ReturnsEmptyList()
    {
        // Arrange
        GetComments.QueryRequest request = new(null);

        // Act
        Result<GetComments.Response> result = await GetComments.HandleAsync(
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Comments.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_WithItemId_ReturnsFilteredComments()
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

        _dbContext.Comments.AddRange(
            new Comment { Id = Guid.NewGuid(), ItemId = item1.Id, Text = "Comment 1", CreatedBy = "user1", CreatedAt = DateTime.UtcNow.AddMinutes(-10) },
            new Comment { Id = Guid.NewGuid(), ItemId = item1.Id, Text = "Comment 2", CreatedBy = "user2", CreatedAt = DateTime.UtcNow.AddMinutes(-5) },
            new Comment { Id = Guid.NewGuid(), ItemId = item2.Id, Text = "Comment 3", CreatedBy = "user3", CreatedAt = DateTime.UtcNow }
        );

        await _dbContext.SaveChangesAsync();

        GetComments.QueryRequest request = new(item1.Id);

        // Act
        Result<GetComments.Response> result = await GetComments.HandleAsync(
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Comments.Should().HaveCount(2);
        result.Value.Comments.Should().OnlyContain(c => c.ItemId == item1.Id);
        result.Value.Comments.Should().BeInDescendingOrder(c => c.CreatedAt); // Should be ordered by CreatedAt descending
    }

    [Fact]
    public async Task HandleAsync_NoItemId_ReturnsAllComments()
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

        _dbContext.Comments.AddRange(
            new Comment { Id = Guid.NewGuid(), ItemId = item1.Id, Text = "Comment 1", CreatedBy = "user1", CreatedAt = DateTime.UtcNow.AddMinutes(-10) },
            new Comment { Id = Guid.NewGuid(), ItemId = item2.Id, Text = "Comment 2", CreatedBy = "user2", CreatedAt = DateTime.UtcNow.AddMinutes(-5) }
        );

        await _dbContext.SaveChangesAsync();

        GetComments.QueryRequest request = new(null);

        // Act
        Result<GetComments.Response> result = await GetComments.HandleAsync(
            request,
            _dbContext,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Comments.Should().HaveCount(2);
        result.Value.Comments.Should().BeInDescendingOrder(c => c.CreatedAt);
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}

