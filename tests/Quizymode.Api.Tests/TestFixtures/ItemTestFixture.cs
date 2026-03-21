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
    protected IProfanityFilterService ProfanityFilter { get; }

    protected ItemTestFixture()
    {
        SimHashService = new SimHashService();
        ProfanityFilter = new ProfanityFilterService();
        
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

        // Ensure geography (or test category) has keyword relations for nav; create if missing
        (Guid nav1Id, Guid nav2Id) = await EnsureCategoryHasKeywordRelationsAsync(category.Id, categoryName, createdBy);

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
            CategoryId = category.Id,
            NavigationKeywordId1 = nav1Id,
            NavigationKeywordId2 = nav2Id
        };

        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();

        return item;
    }

    /// <summary>
    /// Ensures the category has at least one rank-1 and one rank-2 keyword relation (e.g. "topics" -> "europe") for tests. Returns (nav1KeywordId, nav2KeywordId).
    /// </summary>
    protected async Task<(Guid Nav1Id, Guid Nav2Id)> EnsureCategoryHasKeywordRelationsAsync(Guid categoryId, string categoryName, string createdBy)
    {
        const string rank1Name = "topics";
        const string rank2Name = "europe";
        Keyword? k1 = await DbContext.Keywords.FirstOrDefaultAsync(k => k.Name == rank1Name);
        if (k1 is null)
        {
            k1 = new Keyword { Id = Guid.NewGuid(), Name = rank1Name, IsPrivate = false, CreatedBy = createdBy, CreatedAt = DateTime.UtcNow };
            DbContext.Keywords.Add(k1);
            await DbContext.SaveChangesAsync();
        }
        Keyword? k2 = await DbContext.Keywords.FirstOrDefaultAsync(k => k.Name == rank2Name);
        if (k2 is null)
        {
            k2 = new Keyword { Id = Guid.NewGuid(), Name = rank2Name, IsPrivate = false, CreatedBy = createdBy, CreatedAt = DateTime.UtcNow };
            DbContext.Keywords.Add(k2);
            await DbContext.SaveChangesAsync();
        }
        bool hasR1 = await DbContext.KeywordRelations.AnyAsync(kr => kr.CategoryId == categoryId && kr.ParentKeywordId == null && kr.ChildKeywordId == k1.Id);
        if (!hasR1)
        {
            DbContext.KeywordRelations.Add(new KeywordRelation { Id = Guid.NewGuid(), CategoryId = categoryId, ParentKeywordId = null, ChildKeywordId = k1.Id, SortOrder = 0, CreatedAt = DateTime.UtcNow });
            await DbContext.SaveChangesAsync();
        }
        bool hasR2 = await DbContext.KeywordRelations.AnyAsync(kr => kr.CategoryId == categoryId && kr.ParentKeywordId == k1.Id && kr.ChildKeywordId == k2.Id);
        if (!hasR2)
        {
            DbContext.KeywordRelations.Add(new KeywordRelation { Id = Guid.NewGuid(), CategoryId = categoryId, ParentKeywordId = k1.Id, ChildKeywordId = k2.Id, SortOrder = 0, CreatedAt = DateTime.UtcNow });
            await DbContext.SaveChangesAsync();
        }
        return (k1.Id, k2.Id);
    }
}

