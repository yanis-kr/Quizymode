using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Search;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Search;

/// <summary>
/// #319/#320: the SQL behind GET /search against real PostgreSQL (tsvector columns, GIN, pg_trgm, ts_headline).
/// Every test uses its own random nonsense words so the shared container never cross-contaminates results.
/// Requires Docker (see tests README).
/// </summary>
[Trait("Category", "Postgres")]
public sealed class SearchQueryPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private const char HighlightStart = '';
    private const char HighlightEnd = '';

    private void RequireDatabase() => Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

    private static readonly TaxonomyRegistry Registry = new(
        new TestHostEnvironment(),
        Options.Create(new TaxonomyOptions()),
        NullLogger<TaxonomyRegistry>.Instance);

    /// <summary>A pronounceable-free nonsense word that survives the English stemmer unchanged on both sides.</summary>
    private static string Word(string prefix = "zq")
    {
        string letters = new(Guid.NewGuid().ToByteArray().Take(8).Select(b => (char)('a' + (b % 26))).ToArray());
        return prefix + letters;
    }

    private Task<Result<GlobalSearch.Response>> SearchAsync(
        string q,
        string? types = "items",
        IUserContext? user = null,
        int? limit = null,
        int? offset = null)
    {
        TaxonomySearchIndex index = new(Registry);
        TaxonomySearchCounts counts = new(index, new MemoryCache(new MemoryCacheOptions()), NullLogger<TaxonomySearchCounts>.Instance);
        return RunAsync(new GlobalSearch.Request(q, types, limit, offset), user ?? FakeUserContext.Anonymous, index, counts);
    }

    private async Task<Result<GlobalSearch.Response>> RunAsync(
        GlobalSearch.Request request,
        IUserContext user,
        TaxonomySearchIndex index,
        TaxonomySearchCounts counts)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        return await GlobalSearch.HandleAsync(request, db, user, index, counts, NullLogger.Instance, CancellationToken.None);
    }

    private async Task<Item> AddItemAsync(
        string question,
        string correctAnswer = "A",
        string explanation = "",
        string createdBy = "seed",
        bool isPrivate = false,
        Guid? categoryId = null,
        Guid? nav1 = null,
        Guid? nav2 = null)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Guid category = categoryId ?? VisibilitySeed.AddCategory(db).Id;
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = question,
            CorrectAnswer = correctAnswer,
            Explanation = explanation,
            IncorrectAnswers = ["B"],
            FuzzySignature = "abc",
            FuzzyBucket = 1,
            IsPrivate = isPrivate,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            CategoryId = category,
            NavigationKeywordId1 = nav1,
            NavigationKeywordId2 = nav2
        };
        db.Items.Add(item);
        await db.SaveChangesAsync();
        return item;
    }

    private async Task<Collection> AddCollectionAsync(string name, string createdBy = "seed", bool isPublic = true, bool isDiscoverable = true, string? description = null)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = description,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsPublic = isPublic,
            IsDiscoverable = isDiscoverable
        };
        db.Collections.Add(collection);
        await db.SaveChangesAsync();
        return collection;
    }

    private static List<Guid> ItemIds(Result<GlobalSearch.Response> result)
    {
        result.IsSuccess.Should().BeTrue();
        return result.Value.Groups.Items!.Results.Select(r => r.Id).ToList();
    }

    [SkippableFact]
    public async Task MigrationCreatesSearchColumnsIndexesAndTrigramExtension()
    {
        RequireDatabase();
        await using ApplicationDbContext db = fixture.CreateDbContext();
        System.Data.Common.DbConnection connection = db.Database.GetDbConnection();
        await connection.OpenAsync();

        async Task<long> ScalarAsync(string sql)
        {
            await using System.Data.Common.DbCommand command = connection.CreateCommand();
            command.CommandText = sql;
            return Convert.ToInt64(await command.ExecuteScalarAsync());
        }

        (await ScalarAsync("""SELECT count(*) FROM information_schema.columns WHERE column_name = 'SearchVector' AND table_name IN ('Items','Collections') AND is_generated = 'ALWAYS'""")).Should().Be(2);
        (await ScalarAsync("""SELECT count(*) FROM pg_indexes WHERE indexname IN ('IX_Items_SearchVector','IX_Collections_SearchVector','IX_Collections_Name_Trgm')""")).Should().Be(3);
        (await ScalarAsync("""SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'""")).Should().Be(1);
    }

    [SkippableFact]
    public async Task LastWordMatchesAsPrefix_ButOnlyWhileItIsStillBeingTyped()
    {
        RequireDatabase();
        // A fixed final consonant keeps the English stemmer from rewriting the random prefix (for example y -> i).
        string prefix = Word() + "k";
        Item item = await AddItemAsync($"Describe the {prefix}ification process");

        ItemIds(await SearchAsync(prefix)).Should().Contain(item.Id);
        ItemIds(await SearchAsync(prefix + " ")).Should().NotContain(item.Id);
    }

    [SkippableFact]
    public async Task QuotedPhraseAndExcludedWordsAreHonoured()
    {
        RequireDatabase();
        string w1 = Word();
        string w2 = Word();
        string w3 = Word();
        Item adjacent = await AddItemAsync($"{w1} {w2} together");
        Item apart = await AddItemAsync($"{w2} then something {w1}");
        Item withExcluded = await AddItemAsync($"{w1} {w2} and also {w3}");

        List<Guid> phrase = ItemIds(await SearchAsync($"\"{w1} {w2}\" "));
        phrase.Should().Contain(adjacent.Id).And.Contain(withExcluded.Id).And.NotContain(apart.Id);

        List<Guid> excluded = ItemIds(await SearchAsync($"{w1} -{w3} "));
        excluded.Should().Contain(adjacent.Id).And.Contain(apart.Id).And.NotContain(withExcluded.Id);
    }

    [SkippableTheory]
    [InlineData("the and of ")]
    [InlineData("the")]
    [InlineData("a an ")]
    public async Task StopwordOnlyInput_MatchesNothingWithoutError(string q)
    {
        RequireDatabase();
        Result<GlobalSearch.Response> result = await SearchAsync(q, "collections,items");

        result.IsSuccess.Should().BeTrue();
        result.Value.Groups.Items!.Results.Should().BeEmpty();
        result.Value.Groups.Collections!.Results.Should().BeEmpty();
    }

    [SkippableTheory]
    [InlineData("!!")]
    [InlineData("||")]
    [InlineData("((")]
    [InlineData("::")]
    [InlineData("''")]
    [InlineData("a & b")]
    [InlineData("foo:*")]
    [InlineData("foo <-> bar")]
    [InlineData("x'; DROP TABLE \"Items\";--")]
    [InlineData("\\\\")]
    [InlineData("%_")]
    [InlineData("\"\"")]
    [InlineData("\"a")]
    [InlineData("--")]
    [InlineData("-a -b")]
    [InlineData("café")]
    [InlineData("日本")]
    [InlineData("½ ²")]
    [InlineData("😀word")]
    [InlineData("word😀")]
    [InlineData("x")]
    public async Task MetacharactersAndUnicode_NeverThrow(string q)
    {
        RequireDatabase();
        Result<GlobalSearch.Response> result = await SearchAsync(q, "collections,items");

        result.IsSuccess.Should().BeTrue();
        result.Value.Groups.Items.Should().NotBeNull();
        // The table must still exist after the injection attempt.
        ItemIds(await SearchAsync(Word())).Should().BeEmpty();
    }

    [SkippableFact]
    public async Task NonAsciiWordsAreSearchable()
    {
        RequireDatabase();
        string word = Word("caf");
        Item item = await AddItemAsync($"Where is the {word}é located");

        ItemIds(await SearchAsync($"{word}é ")).Should().Contain(item.Id);
    }

    [SkippableFact]
    public async Task QuestionMatchRanksAboveExplanationOnlyMatch()
    {
        RequireDatabase();
        string word = Word();
        Item explanationOnly = await AddItemAsync("Unrelated question text", explanation: $"The reason is {word}");
        Item questionMatch = await AddItemAsync($"What is {word}?");

        List<Guid> ids = ItemIds(await SearchAsync($"{word} "));

        ids.Should().ContainInOrder(questionMatch.Id, explanationOnly.Id);
    }

    [SkippableFact]
    public async Task HighlightRangesAreExact_NoMarkersRemain_AndAnswersAreNeverReturned()
    {
        RequireDatabase();
        string word = Word();
        Item item = await AddItemAsync($"Explain the role of {word} in cells", correctAnswer: "secret-answer", explanation: "secret-explanation");

        GlobalSearch.ItemResult hit = (await SearchAsync($"{word} ")).Value.Groups.Items!.Results.Single(r => r.Id == item.Id);

        hit.Snippet.Text.Should().NotContain(HighlightStart.ToString()).And.NotContain(HighlightEnd.ToString());
        hit.Snippet.Highlights.Should().ContainSingle();
        GlobalSearch.Highlight range = hit.Snippet.Highlights[0];
        hit.Snippet.Text.Substring(range.Start, range.Length).Should().Be(word);
        hit.Snippet.Text.Should().NotContain("secret");
    }

    [SkippableFact]
    public async Task HighlightOffsetsAreUtf16_AfterASurrogatePair()
    {
        RequireDatabase();
        string word = Word();
        Item item = await AddItemAsync($"\U0001F600 \U0001F600 {word} is next");

        GlobalSearch.ItemResult hit = (await SearchAsync($"{word} ")).Value.Groups.Items!.Results.Single(r => r.Id == item.Id);

        hit.Snippet.Highlights.Should().ContainSingle();
        GlobalSearch.Highlight range = hit.Snippet.Highlights[0];
        range.Start.Should().Be(6, "two emoji are four UTF-16 units plus two spaces");
        hit.Snippet.Text.Substring(range.Start, range.Length).Should().Be(word);
    }

    [SkippableFact]
    public async Task PrivateUseCharactersInTheSourceNeverBecomeHighlights()
    {
        RequireDatabase();
        string word = Word();
        Item item = await AddItemAsync($"A{HighlightStart}fake{HighlightEnd} marker next to {word}");

        GlobalSearch.ItemResult hit = (await SearchAsync($"{word} ")).Value.Groups.Items!.Results.Single(r => r.Id == item.Id);

        hit.Snippet.Text.Should().Contain("Afake marker");
        hit.Snippet.Highlights.Should().ContainSingle();
        hit.Snippet.Text.Substring(hit.Snippet.Highlights[0].Start, hit.Snippet.Highlights[0].Length).Should().Be(word);
    }

    [SkippableFact]
    public async Task CollectionNameTypoMatchesThroughTrigrams()
    {
        RequireDatabase();
        string word = Word("zqphoto");
        Collection collection = await AddCollectionAsync($"{word} Basics");
        string typo = word.Remove(word.Length - 3, 1);

        Result<GlobalSearch.Response> result = await SearchAsync($"{typo} ", "collections");

        result.Value.Groups.Collections!.Results.Select(r => r.Id).Should().Contain(collection.Id);
    }

    [SkippableFact]
    public async Task CollectionVisibility_OnlyPublicAndDiscoverable()
    {
        RequireDatabase();
        string word = Word();
        Collection listed = await AddCollectionAsync($"{word} listed");
        Collection publicNotDiscoverable = await AddCollectionAsync($"{word} unlisted", isDiscoverable: false);
        Collection privateOne = await AddCollectionAsync($"{word} private", isPublic: false, isDiscoverable: false);

        List<Guid> ids = (await SearchAsync($"{word} ", "collections")).Value.Groups.Collections!.Results.Select(r => r.Id).ToList();

        ids.Should().Contain(listed.Id).And.NotContain(publicNotDiscoverable.Id).And.NotContain(privateOne.Id);
    }

    [SkippableFact]
    public async Task PrivateItemOfAnotherUserInsideAPublicCollectionIsNotDiscoverable()
    {
        RequireDatabase();
        string word = Word();
        string userB = Guid.NewGuid().ToString();
        Item privateItem = await AddItemAsync($"{word} secret question", createdBy: userB, isPrivate: true);
        Collection publicCollection = await AddCollectionAsync($"Public box of {word}", createdBy: userB);
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            db.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = publicCollection.Id, ItemId = privateItem.Id, AddedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
        }

        Result<GlobalSearch.Response> result = await SearchAsync($"{word} ", "items,collections,mine");

        result.Value.Groups.Items!.Results.Should().BeEmpty();
        GlobalSearch.CollectionResult collection = result.Value.Groups.Collections!.Results.Single(r => r.Id == publicCollection.Id);
        collection.ItemCount.Should().Be(0, "private items are never counted");
        result.Value.Groups.Mine.Should().BeNull();
    }

    [SkippableFact]
    public async Task MineReturnsOnlyTheCallersOwnContent_AndOwnCollectionsLeaveThePublicGroup()
    {
        RequireDatabase();
        string word = Word();
        string userA = Guid.NewGuid().ToString();
        string userB = Guid.NewGuid().ToString();

        Collection mineCollection = await AddCollectionAsync($"{word} mine", createdBy: userA);
        Collection minePrivate = await AddCollectionAsync($"{word} mine private", createdBy: userA, isPublic: false, isDiscoverable: false);
        Collection othersPublic = await AddCollectionAsync($"{word} theirs public", createdBy: userB);
        Collection othersPrivate = await AddCollectionAsync($"{word} theirs private", createdBy: userB, isPublic: false, isDiscoverable: false);
        Item minePrivateItem = await AddItemAsync($"{word} my private item", createdBy: userA, isPrivate: true);
        Item othersPrivateItem = await AddItemAsync($"{word} their private item", createdBy: userB, isPrivate: true);
        Item publicItem = await AddItemAsync($"{word} public item", createdBy: userB);

        Guid liveDoc;
        Guid expiredDoc;
        Guid othersDoc;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            liveDoc = AddDocument(db, userA, $"{word} live notes", DateTime.UtcNow.AddDays(5));
            expiredDoc = AddDocument(db, userA, $"{word} expired notes", DateTime.UtcNow.AddDays(-1));
            othersDoc = AddDocument(db, userB, $"{word} other notes", DateTime.UtcNow.AddDays(5));
            await db.SaveChangesAsync();
        }

        Result<GlobalSearch.Response> result = await SearchAsync($"{word} ", "collections,items,mine", FakeUserContext.User(userA));

        result.IsSuccess.Should().BeTrue();
        GlobalSearch.Groups groups = result.Value.Groups;
        groups.Mine!.Results.Select(r => r.Id).Should()
            .BeEquivalentTo([mineCollection.Id, minePrivate.Id, minePrivateItem.Id, liveDoc]);
        groups.Mine.Results.Select(r => r.Id).Should().NotContain([othersPublic.Id, othersPrivate.Id, othersPrivateItem.Id, expiredDoc, othersDoc]);
        groups.Mine.Results.Single(r => r.Id == liveDoc).Kind.Should().Be(GlobalSearch.KindStudyGuideDocument);
        groups.Mine.Results.Single(r => r.Id == minePrivateItem.Id).Kind.Should().Be(GlobalSearch.KindItem);

        List<Guid> publicCollectionIds = groups.Collections!.Results.Select(r => r.Id).ToList();
        publicCollectionIds.Should().Contain(othersPublic.Id).And.NotContain(mineCollection.Id, "own collections appear in mine instead");
        publicCollectionIds.Should().NotContain(othersPrivate.Id);

        List<Guid> itemIds = groups.Items!.Results.Select(r => r.Id).ToList();
        itemIds.Should().Contain(publicItem.Id).And.NotContain(minePrivateItem.Id).And.NotContain(othersPrivateItem.Id);
    }

    [SkippableFact]
    public async Task MineWithLikeMetacharacters_TreatsThemLiterally()
    {
        RequireDatabase();
        string word = Word();
        string userA = Guid.NewGuid().ToString();
        Guid literal;
        Guid wildcardVictim;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            literal = AddDocument(db, userA, $"{word}_100%", DateTime.UtcNow.AddDays(1));
            wildcardVictim = AddDocument(db, userA, $"{word}x1000", DateTime.UtcNow.AddDays(1));
            await db.SaveChangesAsync();
        }

        Result<GlobalSearch.Response> result = await SearchAsync($"{word}_100%", "mine", FakeUserContext.User(userA));

        result.Value.Groups.Mine!.Results.Select(r => r.Id).Should().Contain(literal).And.NotContain(wildcardVictim);
    }

    [SkippableFact]
    public async Task ItemTopicFieldsAreHiddenForPrivateKeywordsAndCategories()
    {
        RequireDatabase();
        string word = Word();
        Guid publicNav1 = Guid.NewGuid();
        Guid privateNav2 = Guid.NewGuid();
        Guid categoryId;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            categoryId = category.Id;
            db.Keywords.Add(new Keyword { Id = publicNav1, Name = $"pub-{word}", IsPrivate = false, CreatedBy = "seed" });
            db.Keywords.Add(new Keyword { Id = privateNav2, Name = $"priv-{word}", IsPrivate = true, CreatedBy = "someone" });
            await db.SaveChangesAsync();
        }

        Item item = await AddItemAsync($"{word} navigation", categoryId: categoryId, nav1: publicNav1, nav2: privateNav2);

        GlobalSearch.ItemResult hit = (await SearchAsync($"{word} ")).Value.Groups.Items!.Results.Single(r => r.Id == item.Id);

        hit.CategorySlug.Should().StartWith("cat-");
        hit.L1.Should().Be($"pub-{word}");
        hit.L2.Should().BeNull("the L2 keyword is private");
    }

    [SkippableFact]
    public async Task TopicCountsAreLoadedFromPublicItemsOnly()
    {
        RequireDatabase();
        Guid techId = Guid.NewGuid();
        Guid aiMl = Guid.NewGuid();
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            db.Categories.Add(new Category { Id = techId, Name = "tech", IsPrivate = false, CreatedBy = "seed", CreatedAt = DateTime.UtcNow });
            db.Keywords.Add(new Keyword { Id = aiMl, Name = "ai-ml", IsPrivate = false, CreatedBy = "seed" });
            await db.SaveChangesAsync();
        }

        await AddItemAsync(Word() + " one", categoryId: techId, nav1: aiMl);
        await AddItemAsync(Word() + " two", categoryId: techId, nav1: aiMl);
        await AddItemAsync(Word() + " private", categoryId: techId, nav1: aiMl, isPrivate: true, createdBy: "someone");

        TaxonomySearchIndex index = new(Registry);
        TaxonomySearchCounts counts = new(index, new MemoryCache(new MemoryCacheOptions()), NullLogger<TaxonomySearchCounts>.Instance);
        Result<GlobalSearch.Response> result = await RunAsync(
            new GlobalSearch.Request("artificial intelligence", "subcategories", null, null), FakeUserContext.Anonymous, index, counts);

        result.Value.Groups.Subcategories!.Results[0].Should().BeEquivalentTo(
            new GlobalSearch.SubcategoryResult("tech", "ai-ml", null, result.Value.Groups.Subcategories.Results[0].Description, 2));
        index.Find("tech", null, null)!.PublicItemCount.Should().Be(2);
        index.CountsRefreshedAtUtc.Should().NotBeNull();
    }

    [SkippableFact]
    public async Task LimitOffsetAndHasMore()
    {
        RequireDatabase();
        string word = Word();
        for (int index = 0; index < 4; index++)
        {
            await AddItemAsync($"{word} number {index}");
        }

        Result<GlobalSearch.Response> firstPage = await SearchAsync($"{word} ", limit: 3);
        Result<GlobalSearch.Response> secondPage = await SearchAsync($"{word} ", limit: 3, offset: 3);

        firstPage.Value.Groups.Items!.Results.Should().HaveCount(3);
        firstPage.Value.Groups.Items.HasMore.Should().BeTrue();
        secondPage.Value.Groups.Items!.Results.Should().HaveCount(1);
        secondPage.Value.Groups.Items.HasMore.Should().BeFalse();
        firstPage.Value.Groups.Items.Results.Select(r => r.Id).Should().NotIntersectWith(secondPage.Value.Groups.Items.Results.Select(r => r.Id));
    }

    [SkippableFact]
    public async Task Search_WhenPostgresRejectsTheQuery_Returns200ShapedEmptyGroupsAndLogsWarningWithoutQ()
    {
        RequireDatabase();
        // A database that does not exist makes the first query fail with a PostgresException (SQLSTATE 3D000).
        string missingDatabase = new Npgsql.NpgsqlConnectionStringBuilder(fixture.ConnectionString)
        {
            Database = "missing_" + Guid.NewGuid().ToString("N")
        }.ConnectionString;
        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(missingDatabase)
            .Options;
        await using ApplicationDbContext db = new(options);

        string secret = Word("secretterm");
        CapturingLogger logger = new();
        TaxonomySearchIndex index = new(Registry);
        TaxonomySearchCounts counts = new(index, new MemoryCache(new MemoryCacheOptions()), NullLogger<TaxonomySearchCounts>.Instance);

        Result<GlobalSearch.Response> result = await GlobalSearch.HandleAsync(
            new GlobalSearch.Request(secret, "collections,items", null, null),
            db, FakeUserContext.Anonymous, index, counts, logger, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Groups.Collections!.Results.Should().BeEmpty();
        result.Value.Groups.Collections.HasMore.Should().BeFalse();
        result.Value.Groups.Items!.Results.Should().BeEmpty();
        logger.Entries.Should().ContainSingle(entry => entry.Level == LogLevel.Warning);
        logger.Entries.Should().OnlyContain(entry => !entry.Message.Contains(secret, StringComparison.OrdinalIgnoreCase));
    }

    private sealed class CapturingLogger : ILogger
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }

    private static Guid AddDocument(ApplicationDbContext db, string userId, string title, DateTime expiresUtc)
    {
        StudyGuideDocument document = new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = title,
            FileType = "txt",
            FileSha256 = Guid.NewGuid().ToString("N"),
            TextSha256 = Guid.NewGuid().ToString("N"),
            CategoryName = "tech",
            NavigationKeyword1 = "ai-ml",
            NavigationKeyword2 = "llms",
            CreatedUtc = DateTime.UtcNow,
            LastActivityUtc = DateTime.UtcNow,
            ExpiresUtc = DateTime.SpecifyKind(expiresUtc, DateTimeKind.Utc)
        };
        db.StudyGuideDocuments.Add(document);
        return document.Id;
    }
}
