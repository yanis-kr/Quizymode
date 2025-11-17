using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;
using GetItemsHandler = Quizymode.Api.Features.Items.Get.GetItemsHandler;

namespace Quizymode.Api.Tests.Features.Items.Get;

public sealed class GetItemsTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly Mock<IUserContext> _userContextMock;

    public GetItemsTests()
    {
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
    }

    [Fact]
    public async Task HandleAsync_ReturnsAllItems()
    {
        // Arrange
        _dbContext.Items.AddRange(new[]
        {
            new Item { Id = Guid.NewGuid(), Category = "geography", Subcategory = "europe", IsPrivate = false, Question = "Q1", CorrectAnswer = "A1", IncorrectAnswers = new List<string>(), Explanation = "", FuzzySignature = "ABC", FuzzyBucket = 1, CreatedBy = "test", CreatedAt = DateTime.UtcNow },
            new Item { Id = Guid.NewGuid(), Category = "geography", Subcategory = "europe", IsPrivate = false, Question = "Q2", CorrectAnswer = "A2", IncorrectAnswers = new List<string>(), Explanation = "", FuzzySignature = "DEF", FuzzyBucket = 2, CreatedBy = "test", CreatedAt = DateTime.UtcNow }
        });
        await _dbContext.SaveChangesAsync();

        GetItems.QueryRequest request = new(Category: null, Subcategory: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, _dbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.TotalCount.Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_FiltersByCategory()
    {
        // Arrange
        _dbContext.Items.AddRange(new[]
        {
            new Item { Id = Guid.NewGuid(), Category = "geography", Subcategory = "europe", IsPrivate = false, Question = "Q1", CorrectAnswer = "A1", IncorrectAnswers = new List<string>(), Explanation = "", FuzzySignature = "ABC", FuzzyBucket = 1, CreatedBy = "test", CreatedAt = DateTime.UtcNow },
            new Item { Id = Guid.NewGuid(), Category = "history", Subcategory = "europe", IsPrivate = false, Question = "Q2", CorrectAnswer = "A2", IncorrectAnswers = new List<string>(), Explanation = "", FuzzySignature = "DEF", FuzzyBucket = 2, CreatedBy = "test", CreatedAt = DateTime.UtcNow }
        });
        await _dbContext.SaveChangesAsync();

        GetItems.QueryRequest request = new(Category: "geography", Subcategory: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, _dbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Question.Should().Be("Q1");
    }

    [Fact]
    public async Task HandleAsync_PaginatesResults()
    {
        // Arrange
        _dbContext.Items.AddRange(Enumerable.Range(1, 15)
            .Select(i => new Item
            {
                Id = Guid.NewGuid(),
                Category = "geography",
                Subcategory = "europe",
                IsPrivate = false,
                Question = $"Q{i}",
                CorrectAnswer = $"A{i}",
                IncorrectAnswers = new List<string>(),
                Explanation = "",
                FuzzySignature = $"HASH{i}",
                FuzzyBucket = i,
                CreatedBy = "test",
                CreatedAt = DateTime.UtcNow
            }));
        await _dbContext.SaveChangesAsync();

        GetItems.QueryRequest request = new(Category: null, Subcategory: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, _dbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(10);
        result.Value.TotalCount.Should().Be(15);
        result.Value.TotalPages.Should().Be(2);
    }

    public void Dispose()
    {
        _dbContext.Dispose();
    }
}
