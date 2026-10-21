using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>Fixed-identity <see cref="IUserContext"/> for handler-level visibility tests (#285).</summary>
internal sealed record FakeUserContext(bool IsAuthenticated, string? UserId, bool IsAdmin = false) : IUserContext
{
    public static FakeUserContext Anonymous { get; } = new(false, null);

    public static FakeUserContext User(string userId) => new(true, userId);

    public static FakeUserContext Admin(string userId = "admin-id") => new(true, userId, true);
}

/// <summary>Seeding helpers shared by the SQLite and PostgreSQL visibility tests (#285).</summary>
internal static class VisibilitySeed
{
    public static Category AddCategory(ApplicationDbContext db)
    {
        Category category = new()
        {
            Id = Guid.NewGuid(),
            Name = $"cat-{Guid.NewGuid()}",
            IsPrivate = false,
            CreatedBy = "seed",
            CreatedAt = DateTime.UtcNow
        };
        db.Categories.Add(category);
        return category;
    }

    public static Item AddItem(ApplicationDbContext db, Category category, string createdBy, bool isPrivate)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = $"Q-{Guid.NewGuid()}?",
            CorrectAnswer = "A",
            IncorrectAnswers = ["B"],
            FuzzySignature = "abc",
            FuzzyBucket = 1,
            IsPrivate = isPrivate,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            CategoryId = category.Id
        };
        db.Items.Add(item);
        return item;
    }

    public static Collection AddCollection(ApplicationDbContext db, string createdBy, bool isPublic)
    {
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = $"col-{Guid.NewGuid()}",
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsPublic = isPublic
        };
        db.Collections.Add(collection);
        return collection;
    }

    public static void Link(ApplicationDbContext db, Collection collection, Item item) =>
        db.CollectionItems.Add(new CollectionItem
        {
            Id = Guid.NewGuid(),
            CollectionId = collection.Id,
            ItemId = item.Id,
            AddedAt = DateTime.UtcNow
        });

    public static Comment AddComment(ApplicationDbContext db, Item item) =>
        db.Comments.Add(new Comment
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            Text = $"on {item.Id}",
            CreatedBy = "someone",
            CreatedAt = DateTime.UtcNow
        }).Entity;
}
