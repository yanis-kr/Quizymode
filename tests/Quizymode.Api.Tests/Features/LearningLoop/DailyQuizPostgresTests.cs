using FluentAssertions;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using Daily = Quizymode.Api.Features.DailyQuiz.DailyQuiz;

namespace Quizymode.Api.Tests.Features.LearningLoop;

/// <summary>
/// #645: runs the curated candidate query (lower-cased category list, navigation keyword join, picture flag) through the Npgsql
/// provider so a translation failure cannot hide behind SQLite. Requires Docker.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class DailyQuizPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    [SkippableFact]
    public async Task CandidateQuery_TranslatesAndFillsEverySlot()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        string suffix = Guid.NewGuid().ToString("N")[..6];
        Keyword teaser = new() { Id = Guid.NewGuid(), Name = "brain-teasers", CreatedBy = "seed", CreatedAt = DateTime.UtcNow };
        db.Keywords.Add(teaser);
        Dictionary<string, Category> categories = new();
        foreach (string name in new[] { "Geography", "history", "science", "nature", "Trivia", "sports", "exams" })
        {
            Category category = new() { Id = Guid.NewGuid(), Name = $"{name}", CreatedBy = "seed", CreatedAt = DateTime.UtcNow };
            // Category names may already exist from other tests in the shared container; a unique suffix would break the allow-list, so reuse them.
            Category? existing = db.Categories.FirstOrDefault(c => c.Name == name);
            categories[name] = existing ?? category;
            if (existing is null) db.Categories.Add(category);
        }

        await db.SaveChangesAsync();
        List<Item> seeded = new();
        for (int i = 0; i < 3; i++)
        {
            seeded.Add(DailyPoolSeed.NewItem(categories["Geography"], picture: true, question: $"Flag {suffix} {i}?"));
            seeded.Add(DailyPoolSeed.NewItem(categories["history"], question: $"History {suffix} {i}?"));
            seeded.Add(DailyPoolSeed.NewItem(categories["science"], question: $"Science {suffix} {i}?"));
            seeded.Add(DailyPoolSeed.NewItem(categories["Trivia"], brainTeaser: teaser, question: $"Teaser {suffix} {i}?"));
            seeded.Add(DailyPoolSeed.NewItem(categories["sports"], question: $"Sport {suffix} {i}?"));
            seeded.Add(DailyPoolSeed.NewItem(categories["exams"], question: $"Exam {suffix} {i}?"));
        }

        db.Items.AddRange(seeded);
        await db.SaveChangesAsync();
        HashSet<Guid> examIds = seeded.Where(i => i.CategoryId == categories["exams"].Id).Select(i => i.Id).ToHashSet();

        List<Daily.DailySelection> days = await Daily.DryRunAsync(db, new DateOnly(2030, 1, 1), 1, CancellationToken.None);

        days[0].LegacyFallback.Should().BeFalse();
        days[0].Picks.Should().HaveCount(5);
        days[0].Picks.Select(p => p.ItemId).Should().NotIntersectWith(examIds);
        seeded.Single(i => i.Id == days[0].Picks[0].ItemId).QuestionImageKey.Should().NotBeNullOrEmpty();
        seeded.Single(i => i.Id == days[0].Picks[3].ItemId).NavigationKeywordId1.Should().Be(teaser.Id);
    }
}
