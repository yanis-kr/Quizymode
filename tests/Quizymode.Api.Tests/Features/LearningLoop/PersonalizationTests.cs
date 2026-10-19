using FluentAssertions;
using Quizymode.Api.Features.Personalization;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.LearningLoop;

public sealed class PersonalizationTests : DatabaseTestFixture
{
    [Theory]
    [InlineData("Trivia", "trivia")]
    [InlineData("  World  History ", "world-history")]
    [InlineData("Science & Nature!", "science-nature")]
    [InlineData("a--b", "a-b")]
    public void ToSlug_MatchesSpaRule(string name, string expected)
    {
        Personalization.ToSlug(name).Should().Be(expected);
    }

    [Fact]
    public async Task Replace_KeepsOrder_AndGetSkipsCategoriesThatBecamePrivate()
    {
        await LearningLoopTestData.AddCategoryAsync(DbContext, "trivia");
        Category history = await LearningLoopTestData.AddCategoryAsync(DbContext, "history");
        await LearningLoopTestData.AddCategoryAsync(DbContext, "exams");

        Result<Personalization.InterestsResponse> saved = await Personalization.ReplaceInterestsAsync(
            new Personalization.UpdateInterestsRequest(new List<string> { "history", "trivia" }), DbContext, "user-a", CancellationToken.None);
        await Personalization.ReplaceInterestsAsync(
            new Personalization.UpdateInterestsRequest(new List<string> { "exams", "history" }), DbContext, "user-a", CancellationToken.None);

        saved.IsSuccess.Should().BeTrue();
        (await Personalization.GetInterestsAsync(DbContext, "user-a", CancellationToken.None)).Categories.Should().Equal("exams", "history");
        (await Personalization.GetInterestsAsync(DbContext, "user-b", CancellationToken.None)).Categories.Should().BeEmpty();

        history.IsPrivate = true;
        await DbContext.SaveChangesAsync();
        (await Personalization.GetInterestsAsync(DbContext, "user-a", CancellationToken.None)).Categories.Should().Equal("exams");
    }

    [Fact]
    public async Task Replace_RejectsUnknownOrPrivateCategories()
    {
        await LearningLoopTestData.AddCategoryAsync(DbContext, "trivia");
        await LearningLoopTestData.AddCategoryAsync(DbContext, "secret", isPrivate: true);

        Result<Personalization.InterestsResponse> result = await Personalization.ReplaceInterestsAsync(
            new Personalization.UpdateInterestsRequest(new List<string> { "trivia", "secret", "nope" }), DbContext, "user-a", CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        DbContext.UserInterests.Count().Should().Be(0);
    }

    [Fact]
    public void Validator_RejectsMoreThanTenDuplicatesAndBadSlugs()
    {
        Personalization.UpdateValidator validator = new();

        validator.Validate(new Personalization.UpdateInterestsRequest(Enumerable.Range(0, 11).Select(i => $"c{i}").ToList())).IsValid.Should().BeFalse();
        validator.Validate(new Personalization.UpdateInterestsRequest(new List<string> { "a", "a" })).IsValid.Should().BeFalse();
        validator.Validate(new Personalization.UpdateInterestsRequest(new List<string> { "Bad Slug" })).IsValid.Should().BeFalse();
        validator.Validate(new Personalization.UpdateInterestsRequest(new List<string>())).IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task PopularCategories_RanksCompletedCategoryQuizzes_AndOnlyReturnsPublicSlugs()
    {
        await LearningLoopTestData.AddCategoryAsync(DbContext, "trivia");
        await LearningLoopTestData.AddCategoryAsync(DbContext, "history");
        await LearningLoopTestData.AddCategoryAsync(DbContext, "secret", isPrivate: true);
        DateTime at = DateTime.UtcNow.AddHours(-2);
        int n = 0;
        void Run(string contextId, bool completed)
        {
            string session = $"s{n}";
            string runId = $"r{n++}";
            DbContext.AnalyticsEvents.Add(new AnalyticsEvent
            {
                Id = Guid.NewGuid(), EventName = "quick_quiz_started", SessionId = session, RunId = runId, ContextType = "category",
                ContextId = contextId, Total = 5, OccurredUtc = at, Path = "/quiz",
            });
            if (completed)
            {
                DbContext.AnalyticsEvents.Add(new AnalyticsEvent
                {
                    Id = Guid.NewGuid(), EventName = "quiz_completed", SessionId = session, RunId = runId, ContextType = "category",
                    ContextId = contextId, Score = 3, Total = 5, OccurredUtc = at.AddMinutes(1), Path = "/quiz",
                });
            }
        }
        Run("history", true);
        Run("history", true);
        Run("trivia", true);
        Run("trivia", false);
        Run("trivia", false);
        Run("secret", true);
        Run("secret", true);
        Run("secret", true);
        Run("made-up", true);
        await DbContext.SaveChangesAsync();

        Personalization.PopularCategoriesResponse response = await Personalization.ComputePopularCategoriesAsync(DbContext, CancellationToken.None);

        response.Categories.Should().Equal("history", "trivia");
    }
}
