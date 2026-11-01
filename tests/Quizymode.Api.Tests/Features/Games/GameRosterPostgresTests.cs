using FluentAssertions;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Games.GetRoster;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Games;

/// <summary>
/// #381: the SQL eligibility prefilter, visibility, round-robin merge and scope statuses of GET /games/roster
/// against real PostgreSQL (jsonb distractors, btrim, char_length). Requires Docker.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class GameRosterPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private static readonly string Ideographic = ((char)0x3000).ToString();

    private void RequireDatabase() => Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

    private static string Chars(int count) => new('a', count);

    private static string Emoji(int count) => string.Concat(Enumerable.Repeat(char.ConvertFromUtf32(0x1F600), count));

    private static Item Add(
        ApplicationDbContext db,
        Category category,
        string question,
        string answer,
        string[] wrong,
        string? groupLabel = null,
        string owner = "owner",
        bool isPrivate = false)
    {
        Item item = VisibilitySeed.AddItem(db, category, owner, isPrivate);
        item.Question = question;
        item.CorrectAnswer = answer;
        item.IncorrectAnswers = wrong.ToList();
        item.GroupLabel = groupLabel;
        return item;
    }

    private static Item WithPicture(Item item)
    {
        item.QuestionImageKey = "curated:flags/fr";
        item.QuestionImageAlt = "Three vertical bands";
        return item;
    }

    private static Item AddEligible(ApplicationDbContext db, Category category, string owner = "owner", bool isPrivate = false) =>
        Add(db, category, "What is it?", "Yes", ["No"], null, owner, isPrivate);

    private static Item AddIneligible(ApplicationDbContext db, Category category) =>
        Add(db, category, Chars(200), "Yes", ["No"]);

    private async Task<GetGameRoster.Response> GetAsync(
        string[]? scope,
        int? limit = null,
        IUserContext? user = null)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Result<GetGameRoster.Response> result = await GetGameRosterHandler.HandleAsync(
            new GetGameRoster.Request(scope, limit), db, user ?? FakeUserContext.Anonymous, CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
        return result.Value;
    }

    private static HashSet<string> Ids(GetGameRoster.Response response) =>
        response.Items.Select(i => i.Id).ToHashSet();

    [SkippableFact]
    public async Task ThreeEligibleAmongThousandIneligible_AreAlwaysReturned()
    {
        RequireDatabase();
        Category category = null!;
        HashSet<string> expected = [];
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            category = VisibilitySeed.AddCategory(db);
            for (int i = 0; i < 1000; i++)
            {
                AddIneligible(db, category);
            }

            for (int i = 0; i < 3; i++)
            {
                expected.Add(AddEligible(db, category).Id.ToString());
            }

            await db.SaveChangesAsync();
        }

        for (int run = 0; run < 5; run++)
        {
            GetGameRoster.Response response = await GetAsync([category.Name], 200);
            Ids(response).Should().BeEquivalentTo(expected);
            response.Scopes.Should().ContainSingle().Which.Should().Be(
                new GetGameRoster.ScopeResult(category.Name, 3, 3, "ok"));
        }
    }

    [SkippableFact]
    public async Task EligibilityBoundaries_MatchTheClientRules()
    {
        RequireDatabase();
        Category category;
        Dictionary<string, (Guid Id, bool Expected)> cases = [];
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            category = VisibilitySeed.AddCategory(db);

            void Case(string name, bool expected, Item item) => cases[name] = (item.Id, expected);

            Case("question 80", true, Add(db, category, Chars(80), "Yes", ["No"]));
            Case("question 81", false, Add(db, category, Chars(81), "Yes", ["No"]));
            Case("answer 25", true, Add(db, category, "Q?", Chars(25), ["No"]));
            Case("answer 26", false, Add(db, category, "Q?", Chars(26), ["No"]));
            Case("answer 25 padded with spaces", true, Add(db, category, "Q?", "  " + Chars(25) + "  ", ["No"]));
            Case("answer 25 padded with U+3000", true, Add(db, category, "Q?", Ideographic + Chars(25) + Ideographic, ["No"]));
            Case("answer 26 padded with U+3000", false, Add(db, category, "Q?", Ideographic + Chars(26) + Ideographic, ["No"]));
            Case("answer 25 emoji", true, Add(db, category, "Q?", Emoji(25), ["No"]));
            Case("answer 26 emoji", false, Add(db, category, "Q?", Emoji(26), ["No"]));
            Case("question whitespace only", false, Add(db, category, "   ", "Yes", ["No"]));
            Case("answer whitespace only", false, Add(db, category, "Q?", Ideographic, ["No"]));
            Case("distractor 25", true, Add(db, category, "Q?", "Yes", [Chars(25)]));
            Case("only long distractors", false, Add(db, category, "Q?", "Yes", [Chars(26), Chars(40)]));
            Case("long and short distractor", true, Add(db, category, "Q?", "Yes", [Chars(26), "No"]));
            Case("no distractors", false, Add(db, category, "Q?", "Yes", []));
            Case("blank distractor only", false, Add(db, category, "Q?", "Yes", [Ideographic]));
            Case("distractor equals answer", false, Add(db, category, "Q?", "Yes", ["yes"]));
            Case("distractor equals answer after trim", false, Add(db, category, "Q?", "Yes", [" YES " + Ideographic]));
            Case("sort-eligible with long question", true, Add(db, category, Chars(300), "Yes", [], "Fruit"));
            Case("sort label but long answer", false, Add(db, category, Chars(300), Chars(26), [], "Fruit"));
            Case("blank group label", false, Add(db, category, Chars(300), "Yes", [], Ideographic));
            Case("picture question is excluded from question games (#407)", false, WithPicture(Add(db, category, "Which flag?", "Yes", ["No"])));
            Case("picture item with a group label stays Sort It eligible (#407)", true, WithPicture(Add(db, category, "Which flag?", "Yes", [], "Flags")));

            await db.SaveChangesAsync();
        }

        GetGameRoster.Response response = await GetAsync([category.Name]);

        HashSet<string> returned = Ids(response);
        foreach ((string name, (Guid id, bool expected) ) in cases)
        {
            returned.Contains(id.ToString()).Should().Be(expected, name);
        }
    }

    [SkippableFact]
    public async Task Visibility_GuestSeesPublic_OwnerAlsoSeesOwnPrivate_OtherUserDoesNot()
    {
        RequireDatabase();
        Category category;
        Item publicItem;
        Item ownerPrivate;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            category = VisibilitySeed.AddCategory(db);
            publicItem = AddEligible(db, category, "someone", false);
            ownerPrivate = AddEligible(db, category, "owner-1", true);
            AddEligible(db, category, "owner-2", true);
            await db.SaveChangesAsync();
        }

        (await GetAsync([category.Name])).Items.Select(i => i.Id)
            .Should().BeEquivalentTo([publicItem.Id.ToString()]);
        (await GetAsync([category.Name], user: FakeUserContext.User("owner-1"))).Items.Select(i => i.Id)
            .Should().BeEquivalentTo([publicItem.Id.ToString(), ownerPrivate.Id.ToString()]);
        (await GetAsync([category.Name], user: FakeUserContext.User("stranger"))).Items.Select(i => i.Id)
            .Should().BeEquivalentTo([publicItem.Id.ToString()]);
    }

    [SkippableFact]
    public async Task TwoScopes_FiveAndThreeHundredEligible_LimitTwenty_ReturnFivePlusFifteenUnique()
    {
        RequireDatabase();
        Category small;
        Category large;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            small = VisibilitySeed.AddCategory(db);
            large = VisibilitySeed.AddCategory(db);
            for (int i = 0; i < 5; i++)
            {
                AddEligible(db, small);
            }

            for (int i = 0; i < 300; i++)
            {
                AddEligible(db, large);
            }

            await db.SaveChangesAsync();
        }

        GetGameRoster.Response response = await GetAsync([small.Name, large.Name], 20);

        response.Items.Should().HaveCount(20);
        Ids(response).Should().HaveCount(20);
        response.Scopes.Should().Equal(
            new GetGameRoster.ScopeResult(small.Name, 5, 5, "ok"),
            new GetGameRoster.ScopeResult(large.Name, 300, 15, "ok"));
    }

    [SkippableFact]
    public async Task OverlappingScopes_HaveNoDuplicatesAndStillFillTheLimit()
    {
        RequireDatabase();
        Category category;
        Keyword topic;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            category = VisibilitySeed.AddCategory(db);
            topic = new Keyword { Id = Guid.NewGuid(), Name = $"t{Guid.NewGuid():N}"[..20], CreatedBy = "seed" };
            db.Keywords.Add(topic);
            db.KeywordRelations.Add(new KeywordRelation
            {
                Id = Guid.NewGuid(),
                CategoryId = category.Id,
                ChildKeywordId = topic.Id,
                CreatedBy = "seed"
            });
            for (int i = 0; i < 6; i++)
            {
                AddEligible(db, category).NavigationKeywordId1 = topic.Id;
            }

            for (int i = 0; i < 14; i++)
            {
                AddEligible(db, category);
            }

            await db.SaveChangesAsync();
        }

        GetGameRoster.Response response = await GetAsync([category.Name, $"{category.Name}/{topic.Name}"], 20);

        response.Items.Should().HaveCount(20);
        Ids(response).Should().HaveCount(20);
        response.Scopes.Select(s => s.Available).Should().Equal(20, 6);
        response.Scopes.Sum(s => s.Returned).Should().Be(20);
    }

    [SkippableFact]
    public async Task DuplicateScopeTokens_AreCollapsed_CaseInsensitively()
    {
        RequireDatabase();
        Category category;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            category = VisibilitySeed.AddCategory(db);
            AddEligible(db, category);
            await db.SaveChangesAsync();
        }

        GetGameRoster.Response response = await GetAsync([category.Name, $" {category.Name.ToUpperInvariant()} "]);

        response.Scopes.Should().ContainSingle();
        response.Items.Should().ContainSingle();
    }

    [SkippableFact]
    public async Task UnknownCategoryAndUnknownPath_AreEmptyNotErrors()
    {
        RequireDatabase();
        Category category;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            category = VisibilitySeed.AddCategory(db);
            AddEligible(db, category);
            await db.SaveChangesAsync();
        }

        string missing = $"missing-{Guid.NewGuid():N}";
        GetGameRoster.Response response = await GetAsync(
            [missing, $"{category.Name}/nope", $"{category.Name}/nope/deeper", category.Name]);

        response.Scopes.Select(s => s.Status).Should().Equal("empty", "empty", "empty", "ok");
        response.Scopes.Take(3).Should().OnlyContain(s => s.Available == 0 && s.Returned == 0);
        response.Items.Should().ContainSingle();
    }

    [SkippableFact]
    public async Task NoScopes_MeansGlobal_AndReportsOneEmptyTokenScope()
    {
        RequireDatabase();
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            AddEligible(db, category);
            await db.SaveChangesAsync();
        }

        GetGameRoster.Response response = await GetAsync(null, 5);

        response.Scopes.Should().ContainSingle().Which.Scope.Should().BeEmpty();
        response.Items.Should().NotBeEmpty();
        response.Items.Should().OnlyContain(i => i.Collections.Count == 0 && i.Category.Length > 0);
    }
}
