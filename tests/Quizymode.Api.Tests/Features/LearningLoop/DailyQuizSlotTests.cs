using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using Daily = Quizymode.Api.Features.DailyQuiz.DailyQuiz;

namespace Quizymode.Api.Tests.Features.LearningLoop;

internal static class DailyPoolSeed
{
    public static readonly string[] Answers = ["Wrong A", "Wrong B", "Wrong C"];

    public static async Task<Keyword> AddBrainTeaserKeywordAsync(ApplicationDbContext db)
    {
        Keyword keyword = new() { Id = Guid.NewGuid(), Name = "brain-teasers", CreatedBy = "seed", CreatedAt = DateTime.UtcNow };
        db.Keywords.Add(keyword);
        await db.SaveChangesAsync();
        return keyword;
    }

    public static async Task<Category> AddCategoryAsync(ApplicationDbContext db, string name)
    {
        Category category = new() { Id = Guid.NewGuid(), Name = name, IsPrivate = false, CreatedBy = "seed", CreatedAt = DateTime.UtcNow.AddDays(-10) };
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return category;
    }

    /// <summary>An item that meets every curated-pool rule unless a parameter says otherwise.</summary>
    public static Item NewItem(
        Category category,
        bool picture = false,
        Keyword? brainTeaser = null,
        string explanation = "Because.",
        string? question = null,
        string correct = "Right",
        List<string>? incorrect = null)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = question ?? $"Question {Guid.NewGuid():N}?",
            CorrectAnswer = correct,
            IncorrectAnswers = incorrect ?? Answers.ToList(),
            Explanation = explanation,
            FuzzySignature = "0",
            FuzzyBucket = 1,
            CategoryId = category.Id,
            CreatedBy = "seed",
            CreatedAt = DateTime.UtcNow.AddDays(-5),
        };
        if (picture)
        {
            item.QuestionImageKey = $"curated:flags/{item.Id:N}";
            item.QuestionImageAlt = "A flag";
        }

        if (brainTeaser is not null)
        {
            item.NavigationKeywordId1 = brainTeaser.Id;
        }

        return item;
    }

    /// <summary>A pool with <paramref name="perSlot"/> items for every slot plus <paramref name="exams"/> exam items that are never eligible.</summary>
    public static async Task SeedPoolAsync(ApplicationDbContext db, int perSlot, int exams = 5)
    {
        Keyword teaser = await AddBrainTeaserKeywordAsync(db);
        Dictionary<string, Category> categories = new();
        foreach (string name in new[] { "geography", "history", "science", "nature", "trivia", "sports", "civics", "exams" })
        {
            categories[name] = await AddCategoryAsync(db, name);
        }

        for (int i = 0; i < perSlot; i++)
        {
            db.Items.Add(NewItem(categories["geography"], picture: true));
            db.Items.Add(NewItem(categories["geography"]));
            db.Items.Add(NewItem(categories["history"]));
            db.Items.Add(NewItem(categories["science"]));
            db.Items.Add(NewItem(categories["nature"]));
            db.Items.Add(NewItem(categories["trivia"], brainTeaser: i % 2 == 0 ? teaser : null));
            db.Items.Add(NewItem(categories["sports"]));
            db.Items.Add(NewItem(categories["civics"]));
        }

        for (int i = 0; i < exams; i++)
        {
            db.Items.Add(NewItem(categories["exams"]));
        }

        await db.SaveChangesAsync();
    }
}

/// <summary>#645: the curated Daily quiz slots, eligibility rules, fallbacks and the read-only dry run.</summary>
public sealed class DailyQuizSlotTests : DatabaseTestFixture
{
    private static readonly DateTime Now = new(2026, 10, 18, 15, 0, 0, DateTimeKind.Utc);
    private static readonly DateOnly Today = DateOnly.FromDateTime(Now);

    private static Daily.DailyCandidateRow Row(
        string category, bool picture = false, bool teaser = false, string explanation = "Because.", string question = "Q?",
        string correct = "Right", List<string>? incorrect = null) =>
        new(Guid.NewGuid(), category.ToLowerInvariant(), picture, teaser, question, correct, incorrect ?? ["a", "b", "c"], explanation);

    private async Task<List<Item>> StoredSetAsync(DateOnly date)
    {
        List<DailyQuizItem> rows = await DbContext.DailyQuizItems.AsNoTracking().Where(d => d.Date == date && d.ExcludedAt == null).OrderBy(d => d.Position).ToListAsync();
        List<Guid> ids = rows.Select(r => r.ItemId).ToList();
        Dictionary<Guid, Item> items = await DbContext.Items.AsNoTracking().Include(i => i.Category).Where(i => ids.Contains(i.Id)).ToDictionaryAsync(i => i.Id);
        return ids.Select(id => items[id]).ToList();
    }

    private Task<Daily.DailyQuizResponse> GetAsync(ILogger? logger = null, DateTime? now = null) =>
        Daily.GetAsync(DbContext, LearningLoopTestData.User(null), now ?? Now, CancellationToken.None, logger);

    [Fact]
    public async Task SeededPool_FillsEachPositionWithItsSlot_AndEveryPickMeetsTheEligibilityRule()
    {
        await DailyPoolSeed.SeedPoolAsync(DbContext, 6);
        CapturingLoggerProvider logs = new();

        await GetAsync(logs.CreateLogger("test"));
        List<Item> set = await StoredSetAsync(Today);

        set.Should().HaveCount(5);
        set[0].QuestionImageKey.Should().NotBeNullOrEmpty();
        set[1].Category!.Name.Should().BeOneOf("geography", "history");
        set[1].QuestionImageKey.Should().BeNullOrEmpty("slot 2 avoids a second flag");
        set[2].Category!.Name.Should().BeOneOf("science", "nature");
        set[3].Category!.Name.Should().Be("trivia");
        set[3].NavigationKeywordId1.Should().NotBeNull("brain teasers rank first");
        string[] others = set.Take(4).Select(i => i.Category!.Name).ToArray();
        others.Should().NotContain(set[4].Category!.Name);
        set.Should().OnlyContain(i => i.Category!.Name != "exams");
        foreach (Item item in set)
        {
            Daily.IsDailyEligible(new Daily.DailyCandidateRow(item.Id, item.Category!.Name, false, false, item.Question, item.CorrectAnswer, item.IncorrectAnswers, item.Explanation))
                .Should().BeTrue();
        }

        logs.Entries.Should().BeEmpty("no slot fell back");
    }

    [Fact]
    public async Task ExcludedCategories_AreNeverPicked_WhenSlotPoolsAreEmpty_AndFallbacksAreLogged()
    {
        Category sports = await DailyPoolSeed.AddCategoryAsync(DbContext, "sports");
        Category exams = await DailyPoolSeed.AddCategoryAsync(DbContext, "exams");
        Category tech = await DailyPoolSeed.AddCategoryAsync(DbContext, "tech");
        for (int i = 0; i < 6; i++) DbContext.Items.Add(DailyPoolSeed.NewItem(sports));
        for (int i = 0; i < 20; i++)
        {
            DbContext.Items.Add(DailyPoolSeed.NewItem(exams));
            DbContext.Items.Add(DailyPoolSeed.NewItem(tech));
        }

        await DbContext.SaveChangesAsync();
        CapturingLoggerProvider logs = new();

        await GetAsync(logs.CreateLogger("test"));
        List<Item> set = await StoredSetAsync(Today);

        set.Should().HaveCount(5).And.OnlyContain(i => i.Category!.Name == "sports");
        logs.Entries.Should().Contain(e => e.Level == LogLevel.Warning && e.Message.Contains("slot Picture fallback"));
        logs.Entries.Should().Contain(e => e.Message.Contains("filled from any eligible item"));
    }

    [Fact]
    public async Task CategoryNames_MatchCaseInsensitively()
    {
        Category upper = await DailyPoolSeed.AddCategoryAsync(DbContext, "Trivia");
        Category lower = await DailyPoolSeed.AddCategoryAsync(DbContext, "trivia");
        for (int i = 0; i < 3; i++)
        {
            DbContext.Items.Add(DailyPoolSeed.NewItem(upper));
            DbContext.Items.Add(DailyPoolSeed.NewItem(lower));
        }

        await DbContext.SaveChangesAsync();

        List<Daily.DailySelection> days = await Daily.DryRunAsync(DbContext, Today, 1, CancellationToken.None);

        days[0].LegacyFallback.Should().BeFalse();
        days[0].Picks.Should().HaveCount(5);
        days[0].Picks[3].FallbackReason.Should().BeNull("both spellings count as trivia");
    }

    [Fact]
    public async Task PendingAndRejectedPictureItems_AreNeverPickedForThePictureSlot()
    {
        Category geography = await DailyPoolSeed.AddCategoryAsync(DbContext, "geography");
        Category history = await DailyPoolSeed.AddCategoryAsync(DbContext, "history");
        List<Item> blocked = new();
        foreach (ItemImageReviewState state in new[] { ItemImageReviewState.PendingReview, ItemImageReviewState.Rejected })
        {
            Item item = PictureSeed.AddPictureItem(DbContext, geography, "creator", false, state, PictureSeed.AddAsset(DbContext, "creator"));
            item.Explanation = "Because.";
            item.IncorrectAnswers = DailyPoolSeed.Answers.ToList();
            blocked.Add(item);
        }

        for (int i = 0; i < 6; i++) DbContext.Items.Add(DailyPoolSeed.NewItem(history));
        await DbContext.SaveChangesAsync();

        List<Daily.DailySelection> days = await Daily.DryRunAsync(DbContext, Today, 1, CancellationToken.None);

        days[0].Picks.Select(p => p.ItemId).Should().NotIntersectWith(blocked.Select(b => b.Id));
        days[0].Picks[0].FallbackReason.Should().NotBeNull("no approved picture item exists");
    }

    [Fact]
    public void BrainTeasers_RankBeforeOtherTrivia_InTheTriviaSlot()
    {
        List<Daily.DailyCandidateRow> rows = new();
        rows.AddRange(Enumerable.Range(0, 5).Select(_ => Row("geography", picture: true)));
        rows.AddRange(Enumerable.Range(0, 5).Select(_ => Row("science")));
        List<Daily.DailyCandidateRow> trivia = Enumerable.Range(0, 20).Select(_ => Row("trivia")).ToList();
        Daily.DailyCandidateRow teaser = Row("trivia", teaser: true);
        rows.AddRange(trivia);
        rows.Add(teaser);

        for (int day = 0; day < 10; day++)
        {
            Daily.DailySelection selection = Daily.ComputeSelection(Today.AddDays(day), rows, [], []);
            selection.Picks[3].ItemId.Should().Be(teaser.Id);
        }

        Daily.DailySelection without = Daily.ComputeSelection(Today, rows.Where(r => r.Id != teaser.Id).ToList(), [], []);
        without.Picks[3].FallbackReason.Should().BeNull("other trivia fills the slot when no brain teaser is left");
    }

    [Fact]
    public void Wildcard_ExcludesCategoriesUsedByTheOtherSlots_IgnoringCase()
    {
        List<Daily.DailyCandidateRow> rows = new();
        rows.AddRange(Enumerable.Range(0, 4).Select(_ => Row("Geography", picture: true)));
        rows.AddRange(Enumerable.Range(0, 4).Select(_ => Row("Science")));
        rows.AddRange(Enumerable.Range(0, 4).Select(_ => Row("Trivia")));
        rows.AddRange(Enumerable.Range(0, 4).Select(_ => Row("history")));
        rows.AddRange(Enumerable.Range(0, 4).Select(_ => Row("Sports")));

        for (int day = 0; day < 10; day++)
        {
            Daily.DailySelection selection = Daily.ComputeSelection(Today.AddDays(day), rows, [], []);
            Dictionary<Guid, string> category = rows.ToDictionary(r => r.Id, r => r.Category);
            string wildcard = category[selection.Picks[4].ItemId];
            selection.Picks.Take(4).Select(p => category[p.ItemId]).Should().NotContain(wildcard);
            wildcard.Should().Be("sports");
        }
    }

    [Fact]
    public void ItemsThatBreakARule_AreNotEligible()
    {
        Daily.IsDailyEligible(Row("trivia")).Should().BeTrue();
        Daily.IsDailyEligible(Row("exams")).Should().BeFalse();
        Daily.IsDailyEligible(Row("trivia", explanation: "  ")).Should().BeFalse();
        Daily.IsDailyEligible(Row("trivia", question: new string('q', Daily.MaxQuestionChars + 1))).Should().BeFalse();
        Daily.IsDailyEligible(Row("trivia", question: new string('q', Daily.MaxQuestionChars))).Should().BeTrue();
        Daily.IsDailyEligible(Row("trivia", correct: new string('a', Daily.MaxAnswerChars + 1))).Should().BeFalse();
        Daily.IsDailyEligible(Row("trivia", incorrect: ["a", "b", new string('c', Daily.MaxAnswerChars + 1)])).Should().BeFalse();
        Daily.IsDailyEligible(Row("trivia", incorrect: ["a", "b"])).Should().BeFalse();
        Daily.IsDailyEligible(Row("trivia", incorrect: ["a", "b", "b", " "])).Should().BeFalse("duplicates and blanks are not playable distractors");
    }

    [Fact]
    public async Task EmptySlot_FallsBackToWildcard_AndLogsIt()
    {
        // No pictures, no geography/history: slots 0 and 1 are empty, the rest are filled from the other categories.
        Category science = await DailyPoolSeed.AddCategoryAsync(DbContext, "science");
        Category nature = await DailyPoolSeed.AddCategoryAsync(DbContext, "nature");
        Category trivia = await DailyPoolSeed.AddCategoryAsync(DbContext, "trivia");
        Category sports = await DailyPoolSeed.AddCategoryAsync(DbContext, "sports");
        Category civics = await DailyPoolSeed.AddCategoryAsync(DbContext, "civics");
        foreach (Category c in new[] { science, nature, trivia, sports, civics })
        {
            for (int i = 0; i < 3; i++) DbContext.Items.Add(DailyPoolSeed.NewItem(c));
        }

        await DbContext.SaveChangesAsync();
        CapturingLoggerProvider logs = new();

        await GetAsync(logs.CreateLogger("test"));
        List<Item> set = await StoredSetAsync(Today);

        set.Should().HaveCount(5);
        logs.Entries.Should().Contain(e => e.Message.Contains("slot Picture fallback") && e.Message.Contains("wildcard pool"));
        logs.Entries.Should().Contain(e => e.Message.Contains("slot GeoHistory fallback"));
        set[2].Category!.Name.Should().BeOneOf("science", "nature");
        set[3].Category!.Name.Should().Be("trivia");
    }

    [Fact]
    public async Task FewerThanFiveEligible_UsesTheLegacyWholeCatalogOrder_AndLogsIt()
    {
        Category trivia = await DailyPoolSeed.AddCategoryAsync(DbContext, "trivia");
        Category exams = await DailyPoolSeed.AddCategoryAsync(DbContext, "exams");
        for (int i = 0; i < 4; i++) DbContext.Items.Add(DailyPoolSeed.NewItem(trivia));
        for (int i = 0; i < 6; i++) DbContext.Items.Add(DailyPoolSeed.NewItem(exams));
        await DbContext.SaveChangesAsync();
        CapturingLoggerProvider logs = new();

        Daily.DailyQuizResponse response = await GetAsync(logs.CreateLogger("test"));

        List<string> expected = DbContext.Items.AsNoTracking().Select(i => i.Id).ToList()
            .OrderBy(id => Daily.SeedRank("2026-10-18", id)).ThenBy(id => id).Take(5).Select(id => id.ToString()).ToList();
        response.Items.Select(i => i.Id).Should().Equal(expected);
        logs.Entries.Should().ContainSingle(e => e.Level == LogLevel.Warning && e.Message.Contains("fewer than 5 eligible"));
    }

    [Fact]
    public async Task EligibleCountIsTakenAfterTheWindow_SoAnExhaustedPoolFallsBackToLegacy()
    {
        await DailyPoolSeed.SeedPoolAsync(DbContext, 1, exams: 0); // 8 eligible items
        await GetAsync(now: Now.AddDays(-1));

        List<Daily.DailySelection> days = await Daily.DryRunAsync(DbContext, Today, 1, CancellationToken.None);

        days[0].LegacyFallback.Should().BeTrue("only 3 eligible items are left after yesterday's set");
    }

    [Fact]
    public async Task Recomputing_AfterDeletingTheStoredSet_GivesTheSameIds()
    {
        await DailyPoolSeed.SeedPoolAsync(DbContext, 6);
        Daily.DailyQuizResponse first = await GetAsync();
        DbContext.DailyQuizItems.RemoveRange(DbContext.DailyQuizItems);
        DbContext.DailyQuizSets.RemoveRange(DbContext.DailyQuizSets);
        await DbContext.SaveChangesAsync();

        Daily.DailyQuizResponse again = await GetAsync();

        again.Items.Select(i => i.Id).Should().Equal(first.Items.Select(i => i.Id));
    }

    [Fact]
    public async Task StoredSetFromBeforeTheChange_IsReturnedUnchanged_AndExcludeUsesTheSlotOfThePosition()
    {
        await DailyPoolSeed.SeedPoolAsync(DbContext, 6, exams: 5);
        List<Item> legacy = await DbContext.Items.Include(i => i.Category).Where(i => i.Category!.Name == "exams").OrderBy(i => i.Id).Take(5).ToListAsync();
        DbContext.DailyQuizSets.Add(new DailyQuizSet { Date = Today, CreatedAt = DateTime.UtcNow });
        DbContext.DailyQuizItems.AddRange(legacy.Select((item, index) => new DailyQuizItem { Date = Today, ItemId = item.Id, Position = index, CreatedAt = DateTime.UtcNow }));
        await DbContext.SaveChangesAsync();

        Daily.DailyQuizResponse response = await GetAsync();
        response.Items.Select(i => i.Id).Should().Equal(legacy.Select(i => i.Id.ToString()));

        Result<Daily.AdminDayResponse> excluded = await Daily.ExcludeAsync("2026-10-18", legacy[2].Id, DbContext, "admin", Now, CancellationToken.None);
        excluded.IsSuccess.Should().BeTrue();
        Item replacement = await DbContext.Items.Include(i => i.Category)
            .SingleAsync(i => i.Id == DbContext.DailyQuizItems.Single(d => d.Date == Today && d.Position == 2 && d.ExcludedAt == null).ItemId);
        replacement.Category!.Name.Should().BeOneOf("science", "nature");

        Result<Daily.AdminDayResponse> pictureSlot = await Daily.ExcludeAsync("2026-10-18", legacy[0].Id, DbContext, "admin", Now, CancellationToken.None);
        pictureSlot.IsSuccess.Should().BeTrue();
        Item picture = await DbContext.Items
            .SingleAsync(i => i.Id == DbContext.DailyQuizItems.Single(d => d.Date == Today && d.Position == 0 && d.ExcludedAt == null).ItemId);
        picture.QuestionImageKey.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task DryRun_WritesNothing_AndChainsTheWindowAcrossDays()
    {
        await DailyPoolSeed.SeedPoolAsync(DbContext, 9);

        List<Daily.DailySelection> days = await Daily.DryRunAsync(DbContext, Today, 7, CancellationToken.None);

        days.Should().HaveCount(7);
        days.Should().OnlyContain(d => !d.LegacyFallback && d.Picks.Count == 5);
        days.SelectMany(d => d.Picks.Select(p => p.ItemId)).Should().OnlyHaveUniqueItems("each day's picks feed the next day's window");
        DbContext.DailyQuizSets.Count().Should().Be(0);
        DbContext.DailyQuizItems.Count().Should().Be(0);

        List<Daily.DailySelection> again = await Daily.DryRunAsync(DbContext, Today, 7, CancellationToken.None);
        again.SelectMany(d => d.Picks.Select(p => p.ItemId)).Should().Equal(days.SelectMany(d => d.Picks.Select(p => p.ItemId)));
    }

    [Fact]
    public async Task DryRun_ForADayThatIsAlreadyStored_RecomputesItWithoutTouchingTheStoredSet()
    {
        await DailyPoolSeed.SeedPoolAsync(DbContext, 9);
        Daily.DailyQuizResponse stored = await GetAsync();

        List<Daily.DailySelection> days = await Daily.DryRunAsync(DbContext, Today, 1, CancellationToken.None);

        days[0].Picks.Select(p => p.ItemId.ToString()).Should().Equal(stored.Items.Select(i => i.Id));
        DbContext.DailyQuizItems.Count().Should().Be(5);
    }
}
