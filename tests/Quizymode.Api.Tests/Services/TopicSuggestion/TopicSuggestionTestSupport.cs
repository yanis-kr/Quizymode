using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;

namespace Quizymode.Api.Tests.Services.TopicSuggestion;

/// <summary>Records every command text so egress tests can count the item queries topic suggestion runs.</summary>
public sealed class CommandRecorder : DbCommandInterceptor
{
    private readonly List<string> _commands = [];

    /// <summary>When set, the next item-profile projection query throws (simulates a failed load).</summary>
    public bool FailProjection { get; set; }

    public IReadOnlyList<string> Commands
    {
        get
        {
            lock (_commands)
            {
                return _commands.ToList();
            }
        }
    }

    public int ProjectionQueries => Commands.Count(IsProjection);

    public int FingerprintQueries => Commands.Count(IsFingerprint);

    public static bool IsProjection(string sql) => sql.Contains("\"Question\"", StringComparison.Ordinal) && sql.Contains("\"CorrectAnswer\"", StringComparison.Ordinal)
        && sql.Contains("substr", StringComparison.OrdinalIgnoreCase);

    public static bool IsFingerprint(string sql) => sql.Contains("COUNT(*)", StringComparison.OrdinalIgnoreCase) && sql.Contains("MAX(", StringComparison.OrdinalIgnoreCase)
        && sql.Contains("\"Items\"", StringComparison.Ordinal);

    public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        Record(command);
        return base.ReaderExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Record(command);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    private void Record(DbCommand command)
    {
        lock (_commands)
        {
            _commands.Add(command.CommandText);
        }

        if (FailProjection && IsProjection(command.CommandText))
        {
            throw new InvalidOperationException("simulated load failure");
        }
    }
}

/// <summary>A SQLite database whose every context reports its commands to <see cref="Recorder"/>.</summary>
public abstract class TopicDbFixture : DatabaseTestFixture
{
    protected TopicDbFixture() : this(new CommandRecorder())
    {
    }

    private TopicDbFixture(CommandRecorder recorder) : base([recorder])
    {
        Recorder = recorder;
    }

    protected CommandRecorder Recorder { get; }

    internal ApplicationDbContext NewContext() => CreateDbContext();
}

internal sealed class ManualTimeProvider(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}

internal sealed class TestLifetime : IHostApplicationLifetime
{
    private readonly CancellationTokenSource _stopping = new();

    public CancellationToken ApplicationStarted => CancellationToken.None;

    public CancellationToken ApplicationStopping => _stopping.Token;

    public CancellationToken ApplicationStopped => CancellationToken.None;

    public void StopApplication() => _stopping.Cancel();
}

internal sealed class TopicSuggestionHarness
{
    public TopicSuggestionHarness(
        Func<ApplicationDbContext> createDbContext,
        TopicSuggestionOptions? options = null,
        TimeProvider? time = null,
        ILoggerFactory? loggerFactory = null)
    {
        Options = options ?? new TopicSuggestionOptions();
        Time = time as ManualTimeProvider ?? new ManualTimeProvider(new DateTimeOffset(2026, 10, 25, 12, 0, 0, TimeSpan.Zero));
        loggerFactory ??= NullLoggerFactory.Instance;

        ServiceCollection services = new();
        services.AddScoped(_ => createDbContext());
        ScopeFactory = services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();

        Registry = new TaxonomyRegistry(
            new TestHostEnvironment(),
            Microsoft.Extensions.Options.Options.Create(new Quizymode.Api.Shared.Options.TaxonomyOptions()),
            NullLogger<TaxonomyRegistry>.Instance);
        Analyzer = new TopicTextAnalyzer();
        IOptions<TopicSuggestionOptions> wrapped = Microsoft.Extensions.Options.Options.Create(Options);
        Profiles = new TopicSuggestionProfiles(
            ScopeFactory,
            Registry,
            Analyzer,
            wrapped,
            Time,
            new TestLifetime(),
            loggerFactory.CreateLogger<TopicSuggestionProfiles>());
        TaxonomySearchIndex index = new(Registry);
        IMemoryCache cache = new MemoryCache(new MemoryCacheOptions());
        Suggester = new TopicSuggester(
            Registry,
            Analyzer,
            Profiles,
            index,
            new TaxonomySearchCounts(index, cache, NullLogger<TaxonomySearchCounts>.Instance),
            cache,
            wrapped);
    }

    public TopicSuggestionOptions Options { get; }

    public ManualTimeProvider Time { get; }

    public IServiceScopeFactory ScopeFactory { get; }

    public TaxonomyRegistry Registry { get; }

    public TopicTextAnalyzer Analyzer { get; }

    public TopicSuggestionProfiles Profiles { get; }

    public TopicSuggester Suggester { get; }
}

/// <summary>Seeds the public/private shapes the profile eligibility rules distinguish.</summary>
internal static class TopicSeed
{
    public static Category AddCategory(ApplicationDbContext db, string name, bool isPrivate = false)
    {
        Category? existing = db.Categories.FirstOrDefault(category => category.Name == name);
        if (existing is not null)
        {
            return existing;
        }

        Category category = new() { Id = Guid.NewGuid(), Name = name, IsPrivate = isPrivate, CreatedBy = "seed", CreatedAt = DateTime.UtcNow };
        db.Categories.Add(category);
        return category;
    }

    public static Keyword AddKeyword(ApplicationDbContext db, string name, bool isPrivate = false)
    {
        Keyword? existing = db.Keywords.FirstOrDefault(keyword => keyword.Name == name);
        if (existing is not null)
        {
            return existing;
        }

        Keyword keyword = new() { Id = Guid.NewGuid(), Name = name, IsPrivate = isPrivate, CreatedBy = "seed", CreatedAt = DateTime.UtcNow };
        db.Keywords.Add(keyword);
        return keyword;
    }

    public static Item AddItem(
        ApplicationDbContext db,
        string category,
        string l1,
        string l2,
        string question,
        string answer = "answer",
        string explanation = "",
        bool isPrivate = false,
        string createdBy = "seed",
        DateTime? createdAt = null,
        bool categoryIsPrivate = false,
        bool l1IsPrivate = false,
        bool l2IsPrivate = false)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = question,
            CorrectAnswer = answer,
            IncorrectAnswers = ["wrong one", "wrong two"],
            Explanation = explanation,
            FuzzySignature = "abc",
            FuzzyBucket = 1,
            IsPrivate = isPrivate,
            CreatedBy = createdBy,
            CreatedAt = createdAt ?? DateTime.UtcNow,
            CategoryId = AddCategory(db, category, categoryIsPrivate).Id,
            NavigationKeywordId1 = AddKeyword(db, l1, l1IsPrivate).Id,
            NavigationKeywordId2 = AddKeyword(db, l2, l2IsPrivate).Id
        };
        db.Items.Add(item);
        db.SaveChanges();
        return item;
    }
}
