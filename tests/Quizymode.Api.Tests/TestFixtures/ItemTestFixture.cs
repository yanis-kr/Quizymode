using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>
/// Base fixture for item-related tests.
/// Provides common services and helper methods for creating test data.
/// </summary>
public abstract class ItemTestFixture : DatabaseTestFixture
{
    protected ISimHashService SimHashService { get; }
    protected ICategoryResolver CategoryResolver { get; }

    protected ItemTestFixture()
    {
        SimHashService = new SimHashService();
        
        ILogger<CategoryResolver> logger = NullLogger<CategoryResolver>.Instance;
        CategoryResolver = new CategoryResolver(DbContext, logger);
    }

    /// <summary>
    /// Creates a mock user context with default admin settings.
    /// </summary>
    protected Mock<IUserContext> CreateUserContextMock(string? userId = null)
    {
        Mock<IUserContext> mock = new();
        mock.Setup(x => x.UserId).Returns(userId ?? "test-user");
        mock.Setup(x => x.IsAuthenticated).Returns(true);
        mock.Setup(x => x.IsAdmin).Returns(true);
        return mock;
    }

    /// <summary>
    /// Creates an item with categories in the database.
    /// </summary>
    protected async Task<Item> CreateItemWithCategoriesAsync(
        string categoryName,
        string subcategoryName,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string explanation,
        bool isPrivate,
        string createdBy)
    {
        return await CreateItemWithCategoriesAsync(
            Guid.NewGuid(),
            categoryName,
            subcategoryName,
            question,
            correctAnswer,
            incorrectAnswers,
            explanation,
            isPrivate,
            createdBy);
    }

    /// <summary>
    /// Creates an item with categories in the database with a specific ID.
    /// </summary>
    protected async Task<Item> CreateItemWithCategoriesAsync(
        Guid itemId,
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
        string questionText = question.Trim().ToLowerInvariant();
        Item item = new Item
        {
            Id = itemId,
            IsPrivate = isPrivate,
            Question = question,
            CorrectAnswer = correctAnswer,
            IncorrectAnswers = incorrectAnswers,
            Explanation = explanation,
            FuzzySignature = SimHashService.ComputeSimHash(questionText),
            FuzzyBucket = SimHashService.GetFuzzyBucket(SimHashService.ComputeSimHash(questionText)),
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

