using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Services.TopicSuggestion;

/// <summary>#322: lazy, bounded, privacy-safe loading of the public item profiles (AC 8.5, AC 12).</summary>
public sealed class TopicSuggestionProfilesTests : TopicDbFixture
{
    private const string Text = "backpropagation gradient descent";

    private TopicSuggestionHarness CreateHarness(TopicSuggestionOptions? options = null) => new(NewContext, options);

    private void SeedPublicItem(string question = "How does backpropagation use gradient descent")
    {
        using ApplicationDbContext db = NewContext();
        TopicSeed.AddItem(db, "tech", "ai-ml", "deep-learning", question);
    }

    private static async Task CallAsync(TopicSuggestionHarness harness)
    {
        await using AsyncServiceScope scope = harness.ScopeFactory.CreateAsyncScope();
        ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await harness.Profiles.EnsureFreshAsync(db, CancellationToken.None);
    }

    [Fact]
    public void Construction_RunsNoItemQuery_AndScoresOnTaxonomyTextAlone()
    {
        TopicSuggestionHarness harness = CreateHarness();

        Recorder.Commands.Should().BeEmpty();
        harness.Profiles.Model.ProfileItemCount.Should().Be(0);
        harness.Profiles.Model.Score(harness.Analyzer.Analyze("neural nets").Select(t => t.Stem).ToList())
            .Paths.Should().NotBeEmpty();
        harness.Profiles.LoadsStarted.Should().Be(0);
    }

    [Fact]
    public async Task FirstTextCall_StartsExactlyOneBackgroundLoad_AndSecondCallWithinTtlRunsNoQuery()
    {
        SeedPublicItem();
        TopicSuggestionHarness harness = CreateHarness();

        await CallAsync(harness);
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;

        harness.Profiles.LoadsStarted.Should().Be(1);
        Recorder.ProjectionQueries.Should().Be(1);
        Recorder.FingerprintQueries.Should().Be(1);
        harness.Profiles.Model.ProfileItemCount.Should().Be(1);

        int before = Recorder.Commands.Count;
        await CallAsync(harness);
        Recorder.Commands.Count.Should().Be(before, "inside the fingerprint interval nothing touches the database");
    }

    [Fact]
    public async Task AfterTheFingerprintInterval_AnUnchangedFingerprintRunsOnlyTheFingerprintQuery()
    {
        SeedPublicItem();
        TopicSuggestionHarness harness = CreateHarness();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;

        harness.Time.Advance(harness.Options.FingerprintInterval + TimeSpan.FromMinutes(1));
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;

        Recorder.FingerprintQueries.Should().Be(2);
        Recorder.ProjectionQueries.Should().Be(1, "unchanged data never reloads");
        harness.Profiles.LoadsStarted.Should().Be(1);
    }

    [Fact]
    public async Task FingerprintChangesInsideTheMinimumInterval_ProduceNoReload_ThenOneReloadAfterIt()
    {
        SeedPublicItem();
        TopicSuggestionHarness harness = CreateHarness();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;

        for (int change = 0; change < 5; change++)
        {
            SeedPublicItem($"another question about backpropagation number {change}");
            harness.Time.Advance(harness.Options.FingerprintInterval + TimeSpan.FromMinutes(1));
            await CallAsync(harness);
            await harness.Profiles.CurrentLoad;
        }

        harness.Profiles.LoadsStarted.Should().Be(1, "five data changes inside MinReloadInterval must not reload");
        Recorder.ProjectionQueries.Should().Be(1);

        harness.Time.Advance(harness.Options.MinReloadInterval);
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;

        harness.Profiles.LoadsStarted.Should().Be(2);
        harness.Profiles.Model.ProfileItemCount.Should().Be(6);
    }

    [Fact]
    public async Task Invalidate_BypassesTheMinimumInterval_ButRespectsTheDailyCap()
    {
        SeedPublicItem();
        TopicSuggestionHarness harness = CreateHarness(new TopicSuggestionOptions { MaxLoadsPerDay = 2 });
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;

        harness.Profiles.Invalidate();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;
        harness.Profiles.LoadsStarted.Should().Be(2, "a seed-sync invalidation reloads without waiting for the interval");

        harness.Profiles.Invalidate();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;
        harness.Profiles.LoadsStarted.Should().Be(2, "the daily cap of two loads is used up");

        harness.Time.Advance(TimeSpan.FromHours(25));
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;
        harness.Profiles.LoadsStarted.Should().Be(3, "the cap is a rolling 24 hours");
    }

    [Fact]
    public async Task AFailedLoad_KeepsThePreviousModel_AndRetriesOnlyAfterTheRetryDelay()
    {
        SeedPublicItem();
        TopicSuggestionHarness harness = CreateHarness();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;
        TopicSuggestionModel loaded = harness.Profiles.Model;
        loaded.ProfileItemCount.Should().Be(1);

        Recorder.FailProjection = true;
        harness.Profiles.Invalidate();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;
        harness.Profiles.LoadsStarted.Should().Be(2);
        harness.Profiles.Model.Should().BeSameAs(loaded, "a failed load keeps the previous model");

        Recorder.FailProjection = false;
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;
        harness.Profiles.LoadsStarted.Should().Be(2, "no retry before the failure delay");

        harness.Time.Advance(harness.Options.FailureRetry + TimeSpan.FromSeconds(1));
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;
        harness.Profiles.LoadsStarted.Should().Be(3);
        harness.Profiles.Model.Should().NotBeSameAs(loaded);
    }

    [Fact]
    public async Task OnlyEligibleItemsFeedTheProfiles()
    {
        using (ApplicationDbContext db = NewContext())
        {
            TopicSeed.AddItem(db, "tech", "ai-ml", "deep-learning", "eligible public item about zzpublicword");
            TopicSeed.AddItem(db, "tech", "ai-ml", "deep-learning", "private item about zzprivateitem", isPrivate: true, createdBy: "someone");
            TopicSeed.AddItem(db, "hidden-cat", "ai-ml", "deep-learning", "item in a private category zzprivatecat", categoryIsPrivate: true);
            TopicSeed.AddItem(db, "tech", "private-l1", "deep-learning", "item with private l1 keyword zzprivatel1", l1IsPrivate: true);
            TopicSeed.AddItem(db, "tech", "ai-ml", "private-l2", "item with private l2 keyword zzprivatel2", l2IsPrivate: true);
            TopicSeed.AddItem(db, "tech", "ai-ml", "legacy-leaf", "item on a legacy path zzlegacypath");
            TopicSeed.AddItem(db, "not-in-taxonomy", "x", "y", "item in an unknown category zzunknowncat");
        }

        TopicSuggestionHarness harness = CreateHarness();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;

        harness.Profiles.Model.ProfileItemCount.Should().Be(1);
        foreach (string word in new[] { "zzprivateitem", "zzprivatecat", "zzprivatel1", "zzprivatel2", "zzlegacypath", "zzunknowncat" })
        {
            harness.Profiles.Model.Score([word]).Paths.Should().BeEmpty(word);
        }

        harness.Profiles.Model.Score(["zzpublicword"]).Paths.Should().NotBeEmpty();
    }

    [Fact]
    public async Task AnItemMadePrivate_StopsContributingAfterTheNextReload()
    {
        Item item;
        using (ApplicationDbContext db = NewContext())
        {
            item = TopicSeed.AddItem(db, "tech", "ai-ml", "deep-learning", "a question about zzwaspublic words");
        }

        TopicSuggestionHarness harness = CreateHarness();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;
        harness.Profiles.Model.Score(["zzwaspublic"]).Paths.Should().NotBeEmpty();

        using (ApplicationDbContext db = NewContext())
        {
            Item stored = await db.Items.SingleAsync(candidate => candidate.Id == item.Id);
            stored.IsPrivate = true;
            await db.SaveChangesAsync();
        }

        harness.Profiles.Invalidate();
        await CallAsync(harness);
        await harness.Profiles.CurrentLoad;

        harness.Profiles.Model.Score(["zzwaspublic"]).Paths.Should().BeEmpty("a private item no longer contributes once the profiles reload");
    }

    [Fact]
    public void TheProjection_SelectsNoAnswersListOrKeywordColumns_AndCapsTheExplanation()
    {
        using ApplicationDbContext db = NewContext();
        TopicSeed.AddItem(db, "tech", "ai-ml", "deep-learning", "question", explanation: "0123456789abcdef");

        IQueryable<TopicSuggestionProfiles.ProfileRow> query = TopicSuggestionProfiles.ProjectEligibleRows(db, 5);
        string sql = query.ToQueryString();

        sql.Should().NotContain("IncorrectAnswers").And.NotContain("ItemKeywords").And.NotContain("CreatedBy");
        sql.Should().Contain("substr", because: "the explanation is cut in the database, before it crosses the wire");
        query.Single().Explanation.Should().Be("01234");
    }

    [Fact]
    public async Task ConcurrentCalls_StartASingleLoad()
    {
        SeedPublicItem();
        TopicSuggestionHarness harness = CreateHarness();

        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => CallAsync(harness)));
        await harness.Profiles.CurrentLoad;

        harness.Profiles.LoadsStarted.Should().Be(1);
        Recorder.ProjectionQueries.Should().Be(1);
    }
}
