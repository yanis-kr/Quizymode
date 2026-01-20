using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Services;
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
    /// Creates an item with a category in the database.
    /// </summary>
    protected async Task<Item> CreateItemWithCategoryAsync(
        string categoryName,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string explanation,
        bool isPrivate,
        string createdBy)
    {
        return await CreateItemWithCategoryAsync(
            Guid.NewGuid(),
            categoryName,
            question,
            correctAnswer,
            incorrectAnswers,
            explanation,
            isPrivate,
            createdBy);
    }

    /// <summary>
    /// Creates an item with a category in the database with a specific ID.
    /// </summary>
    protected async Task<Item> CreateItemWithCategoryAsync(
        Guid itemId,
        string categoryName,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string explanation,
        bool isPrivate,
        string createdBy)
    {
        // Create or get category
        // Note: Category names are unique (unique constraint on Name), so we check by name only
        Category? category = await DbContext.Categories
            .FirstOrDefaultAsync(c => c.Name == categoryName);
        
        if (category is null)
        {
            category = new Category
            {
                Id = Guid.NewGuid(),
                Name = categoryName,
                IsPrivate = isPrivate,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };
            DbContext.Categories.Add(category);
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
            CreatedAt = DateTime.UtcNow,
            CategoryId = category.Id
        };

        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();

        return item;
    }
}

