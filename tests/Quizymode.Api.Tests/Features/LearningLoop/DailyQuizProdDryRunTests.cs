using System.Globalization;
using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;
using Xunit;
using Daily = Quizymode.Api.Features.DailyQuiz.DailyQuiz;

namespace Quizymode.Api.Tests.Features.LearningLoop;

/// <summary>
/// #645 evidence harness: a read-only dry run of the curated daily selection against a real database (normally prod), for seven
/// consecutive dates, written as a markdown table. It is skipped unless BOTH <c>QM_AGENT_SUPADB_CS</c> (a .NET connection string)
/// and <c>QM_RUN_PROD_DRYRUN=1</c> are set, so a plain <c>dotnet test</c> never touches a remote database.
///
/// Safety: the connection string is read inside this process and never logged, printed, or put in a message. The session is forced
/// read-only (startup option <c>default_transaction_read_only=on</c>) and <c>SHOW default_transaction_read_only</c> must return
/// <c>on</c> before anything else runs. The context is built without migrations or EnsureCreated, and <c>DryRunAsync</c> never saves.
/// Optional: <c>QM_DRYRUN_START</c> (yyyy-MM-dd, default tomorrow UTC) and <c>QM_DRYRUN_OUT</c> (output path, default a temp file).
/// The output holds item text and categories only, no user data.
/// </summary>
[Trait("Category", "ProdDryRun")]
public sealed class DailyQuizProdDryRunTests
{
    private const string ConnectionVariable = "QM_AGENT_SUPADB_CS";
    private const string OptInVariable = "QM_RUN_PROD_DRYRUN";
    private const int Days = 7;

    [SkippableFact]
    public async Task DryRun_SevenConsecutiveDates_WritesTableAndHoldsTheSelectionRules()
    {
        string? connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        Skip.IfNot(
            Environment.GetEnvironmentVariable(OptInVariable) == "1" && !string.IsNullOrWhiteSpace(connectionString),
            $"Set {ConnectionVariable} and {OptInVariable}=1 to run the read-only daily quiz dry run.");

        DateOnly start = ReadStartDate();
        CapturingLogger logger = new();
        List<Daily.DailySelection> selections;
        Dictionary<Guid, ItemFacts> facts;

        try
        {
            NpgsqlConnectionStringBuilder builder = new(connectionString!) { Options = "-c default_transaction_read_only=on" };
            await using NpgsqlDataSource dataSource = NpgsqlDataSource.Create(builder.ConnectionString);

            await using (NpgsqlConnection connection = await dataSource.OpenConnectionAsync())
            await using (NpgsqlCommand command = new("SHOW default_transaction_read_only", connection))
            {
                string? readOnly = (string?)await command.ExecuteScalarAsync();
                readOnly.Should().Be("on", "the dry run must never use a writable session");
            }

            DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseNpgsql(dataSource)
                .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)
                .Options;
            await using ApplicationDbContext db = new(options);

            selections = await Daily.DryRunAsync(db, start, Days, CancellationToken.None, logger);

            Guid[] ids = selections.SelectMany(s => s.Picks).Select(p => p.ItemId).Distinct().ToArray();
            List<ItemFacts> rows = await db.Items
                .Where(i => ids.Contains(i.Id))
                .Select(i => new ItemFacts(
                    i.Id,
                    i.Category != null ? i.Category.Name : string.Empty,
                    i.Question,
                    i.CorrectAnswer,
                    i.IncorrectAnswers,
                    i.QuestionImageKey != null))
                .ToListAsync();
            facts = rows.ToDictionary(r => r.Id);
        }
        catch (Exception ex) when (ex is NpgsqlException or InvalidOperationException or ArgumentException or TimeoutException)
        {
            // Never surface the original message: connection errors can echo host, user or option text.
            throw new InvalidOperationException($"The dry run could not read the database ({ex.GetType().Name}); details withheld.");
        }

        string markdown = BuildMarkdown(start, selections, facts, logger.Lines);
        string outPath = Environment.GetEnvironmentVariable("QM_DRYRUN_OUT") is { Length: > 0 } configured
            ? configured
            : Path.Combine(Path.GetTempPath(), "quizymode-daily-dryrun.md");
        await File.WriteAllTextAsync(outPath, markdown, Encoding.UTF8);

        selections.Should().HaveCount(Days);
        foreach (Daily.DailySelection selection in selections)
        {
            selection.LegacyFallback.Should().BeFalse($"{selection.Date:yyyy-MM-dd} should have at least five eligible items");
            selection.Picks.Should().HaveCount(5);
            selection.Picks.Select(p => p.ItemId).Distinct().Should().HaveCount(5);
        }

        List<Guid> all = selections.SelectMany(s => s.Picks).Select(p => p.ItemId).ToList();
        all.Distinct().Count().Should().Be(all.Count, "no item may repeat across the seven days");
        foreach (Guid id in all)
        {
            facts.Should().ContainKey(id);
            Daily.AllowedCategories.Should().Contain(facts[id].Category.ToLowerInvariant());
        }
    }

    private static DateOnly ReadStartDate()
    {
        string? raw = Environment.GetEnvironmentVariable("QM_DRYRUN_START");
        if (!string.IsNullOrWhiteSpace(raw)
            && DateOnly.TryParseExact(raw.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateOnly parsed))
        {
            return parsed;
        }

        return DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1));
    }

    private static string BuildMarkdown(
        DateOnly start,
        List<Daily.DailySelection> selections,
        Dictionary<Guid, ItemFacts> facts,
        IReadOnlyList<string> logLines)
    {
        StringBuilder sb = new();
        sb.AppendLine(CultureInfo.InvariantCulture, $"# Daily quiz dry run, {start:yyyy-MM-dd} for {Days} days");
        sb.AppendLine();
        sb.AppendLine("Read-only computation; nothing was stored. Question text is escaped for a markdown table.");
        sb.AppendLine();
        sb.AppendLine("| Date | Slot | Category | Question | Picture | Question length | Max answer length | Fallback |");
        sb.AppendLine("| --- | --- | --- | --- | --- | --- | --- | --- |");
        foreach (Daily.DailySelection selection in selections)
        {
            foreach (Daily.DailyPick pick in selection.Picks)
            {
                ItemFacts item = facts[pick.ItemId];
                int maxAnswer = new[] { item.CorrectAnswer }.Concat(item.IncorrectAnswers)
                    .Select(a => (a ?? string.Empty).Trim().Length)
                    .Max();
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"| {selection.Date:yyyy-MM-dd} | {pick.Slot} | {item.Category} | {Escape(item.Question)} | {(item.HasPicture ? "yes" : "no")} | {item.Question.Trim().Length} | {maxAnswer} | {Escape(pick.FallbackReason ?? string.Empty)} |");
            }
        }

        sb.AppendLine();
        sb.AppendLine("## Fallback log lines");
        sb.AppendLine();
        if (logLines.Count == 0)
        {
            sb.AppendLine("None.");
        }
        else
        {
            foreach (string line in logLines)
            {
                sb.AppendLine(CultureInfo.InvariantCulture, $"- {Escape(line)}");
            }
        }

        return sb.ToString();
    }

    private static string Escape(string text) =>
        text.Replace("|", "\\|", StringComparison.Ordinal).Replace("\r", " ", StringComparison.Ordinal).Replace("\n", " ", StringComparison.Ordinal);

    private sealed record ItemFacts(Guid Id, string Category, string Question, string CorrectAnswer, List<string> IncorrectAnswers, bool HasPicture);

    private sealed class CapturingLogger : ILogger
    {
        private readonly List<string> _lines = new();

        public IReadOnlyList<string> Lines => _lines;

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            _lines.Add($"{logLevel}: {formatter(state, exception)}");
    }
}
