using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.GetRandom;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;
using GetRandom = Quizymode.Api.Features.Items.GetRandom.GetRandom;

namespace Quizymode.Api.Tests.Features.Items.GetRandom;

public sealed class GetRandomTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly Mock<IUserContext> _userContextMock;

    public GetRandomTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _userContextMock = new Mock<IUserContext>();
    }

    [Fact]
    public async Task HandleAsync_NoItems_ReturnsEmptyList()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);
        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_AnonymousUser_ReturnsOnlyPublicItems()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item publicItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        Item privateItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            Question = "What is the capital of Spain?",
            CorrectAnswer = "Madrid",
            IncorrectAnswers = new List<string> { "Barcelona" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(publicItem);
        _dbContext.Items.Add(privateItem);
        await _dbContext.SaveChangesAsync();

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Id.Should().Be(publicItem.Id.ToString());
        result.Value.Items[0].IsPrivate.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_AuthenticatedUser_ReturnsPublicAndOwnPrivateItems()
    {
        // Arrange
        string userId = "user123";
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _userContextMock.Setup(x => x.UserId).Returns(userId);

        Item publicItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            CreatedBy = "other",
            CreatedAt = DateTime.UtcNow
        };

        Item ownPrivateItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            Question = "What is the capital of Spain?",
            CorrectAnswer = "Madrid",
            IncorrectAnswers = new List<string> { "Barcelona" },
            Explanation = "Test",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow
        };

        Item otherPrivateItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = true,
            Question = "What is the capital of Italy?",
            CorrectAnswer = "Rome",
            IncorrectAnswers = new List<string> { "Milan" },
            Explanation = "Test",
            CreatedBy = "other",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(publicItem);
        _dbContext.Items.Add(ownPrivateItem);
        _dbContext.Items.Add(otherPrivateItem);
        await _dbContext.SaveChangesAsync();

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.Should().Contain(i => i.Id == publicItem.Id.ToString());
        result.Value.Items.Should().Contain(i => i.Id == ownPrivateItem.Id.ToString());
        result.Value.Items.Should().NotContain(i => i.Id == otherPrivateItem.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_WithCategoryFilter_ReturnsFilteredItems()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item geographyItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        Item historyItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "history",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "When did WW2 end?",
            CorrectAnswer = "1945",
            IncorrectAnswers = new List<string> { "1944" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(geographyItem);
        _dbContext.Items.Add(historyItem);
        await _dbContext.SaveChangesAsync();

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new("geography", null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Category.Should().Be("geography");
    }

    [Fact]
    public async Task HandleAsync_WithCategoryAndSubcategoryFilter_ReturnsFilteredItems()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item europeItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "europe",
            IsPrivate = false,
            Question = "What is the capital of France?",
            CorrectAnswer = "Paris",
            IncorrectAnswers = new List<string> { "Lyon" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        Item asiaItem = new Item
        {
            Id = Guid.NewGuid(),
            Category = "geography",
            Subcategory = "asia",
            IsPrivate = false,
            Question = "What is the capital of Japan?",
            CorrectAnswer = "Tokyo",
            IncorrectAnswers = new List<string> { "Osaka" },
            Explanation = "Test",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Items.Add(europeItem);
        _dbContext.Items.Add(asiaItem);
        await _dbContext.SaveChangesAsync();

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new("geography", "europe", 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Subcategory.Should().Be("europe");
    }

    [Fact]
    public async Task HandleAsync_CountLimit_RespectsRequestedCount()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        for (int i = 0; i < 20; i++)
        {
            Item item = new Item
            {
                Id = Guid.NewGuid(),
                Category = "geography",
                Subcategory = "europe",
                IsPrivate = false,
                Question = $"Question {i}?",
                CorrectAnswer = $"Answer {i}",
                IncorrectAnswers = new List<string> { "Wrong" },
                Explanation = "Test",
                CreatedBy = "test",
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.Items.Add(item);
        }

        await _dbContext.SaveChangesAsync();

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, null, 5);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            _dbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(5);
    }

    public void Dispose()
    {
        _dbContext?.Dispose();
    }
}

