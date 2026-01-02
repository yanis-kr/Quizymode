using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using GetItemsHandler = Quizymode.Api.Features.Items.Get.GetItemsHandler;

namespace Quizymode.Api.Tests.Features.Items.Get;

public sealed class GetItemsTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;

    public GetItemsTests()
    {
        _userContextMock = new Mock<IUserContext>();
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _userContextMock.Setup(x => x.UserId).Returns("test");
        _userContextMock.Setup(x => x.IsAdmin).Returns(true);
    }

    private async Task<Item> CreateItemWithCategoriesAsync(
        string categoryName,
        string subcategoryName,
        string question,
        string correctAnswer,
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
            IncorrectAnswers = new List<string>(),
            Explanation = "",
            FuzzySignature = $"HASH{question}",
            FuzzyBucket = question.GetHashCode() % 256,
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

    [Fact]
    public async Task HandleAsync_ReturnsAllItems()
    {
        // Arrange
        await CreateItemWithCategoriesAsync("geography", "europe", "Q1", "A1", isPrivate: false, createdBy: "test");
        await CreateItemWithCategoriesAsync("geography", "europe", "Q2", "A2", isPrivate: false, createdBy: "test");

        GetItems.QueryRequest request = new(Category: null, Subcategory: null, IsPrivate: null, Keywords: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.TotalCount.Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_FiltersByCategory()
    {
        // Arrange
        await CreateItemWithCategoriesAsync("geography", "europe", "Q1", "A1", isPrivate: false, createdBy: "test");
        await CreateItemWithCategoriesAsync("history", "europe", "Q2", "A2", isPrivate: false, createdBy: "test");

        GetItems.QueryRequest request = new(Category: "geography", Subcategory: null, IsPrivate: null, Keywords: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Question.Should().Be("Q1");
    }

    [Fact]
    public async Task HandleAsync_PaginatesResults()
    {
        // Arrange
        for (int i = 1; i <= 15; i++)
        {
            await CreateItemWithCategoriesAsync("geography", "europe", $"Q{i}", $"A{i}", isPrivate: false, createdBy: "test");
        }

        GetItems.QueryRequest request = new(Category: null, Subcategory: null, IsPrivate: null, Keywords: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(10);
        result.Value.TotalCount.Should().Be(15);
        result.Value.TotalPages.Should().Be(2);
    }

}
