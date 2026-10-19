using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Tests.Features.LearningLoop;

internal static class LearningLoopTestData
{
    public static async Task<Category> AddCategoryAsync(ApplicationDbContext db, string name, bool isPrivate = false)
    {
        Category category = new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            IsPrivate = isPrivate,
            CreatedBy = "seed",
            CreatedAt = DateTime.UtcNow.AddDays(-10),
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return category;
    }

    public static async Task<Item> AddItemAsync(
        ApplicationDbContext db,
        Category? category,
        bool isPrivate = false,
        string createdBy = "seed",
        List<string>? incorrect = null,
        string? question = null)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = question ?? $"Question {Guid.NewGuid():N}",
            CorrectAnswer = "Right",
            IncorrectAnswers = incorrect ?? new List<string> { "Wrong 1", "Wrong 2" },
            Explanation = string.Empty,
            FuzzySignature = "0",
            CategoryId = category?.Id,
            IsPrivate = isPrivate,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow.AddDays(-5),
        };
        db.Items.Add(item);
        await db.SaveChangesAsync();
        return item;
    }

    public static IUserContext User(string? userId, bool isAdmin = false)
    {
        Mock<IUserContext> context = new();
        context.SetupGet(c => c.IsAuthenticated).Returns(userId is not null);
        context.SetupGet(c => c.UserId).Returns(userId);
        context.SetupGet(c => c.IsAdmin).Returns(isAdmin);
        return context.Object;
    }
}
