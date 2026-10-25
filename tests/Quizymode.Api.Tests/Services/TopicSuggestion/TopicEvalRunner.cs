using System.Text.Json;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Quizymode.Api.Tests.TestFixtures;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Tests.Services.TopicSuggestion;

internal sealed record SeedItem(string Category, string L1, string L2, string Question, string Answer, string Explanation);

internal enum EvalScenario
{
    /// <summary>Question, answer and explanation, as the manual create form sends them.</summary>
    QuestionAnswerExplanation,

    /// <summary>Question and answer only.</summary>
    QuestionAnswer,

    /// <summary>Notes-like text: up to five held-out items of one L2 concatenated.</summary>
    Notes
}

/// <param name="Confidence">Model confidence for the query (0 when it was not scored).</param>
/// <param name="Attempted">False when the query had too few analyzed terms to be scored at all.</param>
internal sealed record QueryOutcome(
    SeedItem Truth,
    string QueryQuestion,
    double Confidence,
    bool Attempted,
    IReadOnlyList<TopicPathScore> Paths);

internal sealed record EvalMetrics(
    int Queries,
    double Coverage,
    double CategoryAt1,
    double L1At3,
    double L2At1,
    double L2At5,
    double L1Mrr,
    double L1At3WhenAnswered);

/// <summary>
/// Shared evaluation core for #322: loads <c>data/seed-source</c>, rebuilds the model per cross-validation fold so a query
/// item never contributes to the model that scores it, and computes the accuracy metrics. Used by the regression guard and
/// by the opt-in report (<c>QM_TOPIC_EVAL=1</c>).
/// </summary>
internal static class TopicEvalRunner
{
    public const int Folds = 10;
    private const int ReportedLimit = 5;

    private static readonly Lazy<IReadOnlyList<SeedItem>> LazyItems = new(LoadSeedItems);
    private static readonly Lazy<TaxonomyRegistry> LazyRegistry = new(() => new TaxonomyRegistry(
        new TestHostEnvironment(),
        Options.Create(new TaxonomyOptions()),
        NullLogger<TaxonomyRegistry>.Instance));

    public static IReadOnlyList<SeedItem> Items => LazyItems.Value;

    public static TaxonomyRegistry Registry => LazyRegistry.Value;

    public static string? FindRepoRoot()
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (Directory.Exists(Path.Combine(directory.FullName, "data", "seed-source", "items")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }

    private static IReadOnlyList<SeedItem> LoadSeedItems()
    {
        string? root = FindRepoRoot();
        if (root is null)
        {
            return [];
        }

        List<SeedItem> items = [];
        foreach (string file in Directory.EnumerateFiles(Path.Combine(root, "data", "seed-source", "items"), "*.json", SearchOption.AllDirectories).Order(StringComparer.Ordinal))
        {
            using JsonDocument document = JsonDocument.Parse(File.ReadAllText(file));
            foreach (JsonElement element in document.RootElement.EnumerateArray())
            {
                string category = Text(element, "category").ToLowerInvariant();
                string l1 = Text(element, "navigationKeyword1").ToLowerInvariant();
                string l2 = Text(element, "navigationKeyword2").ToLowerInvariant();
                if (!Registry.IsValidNavigationPath(category, l1, l2))
                {
                    continue;
                }

                items.Add(new SeedItem(category, l1, l2, Text(element, "question"), Text(element, "correctAnswer"), Text(element, "explanation")));
            }
        }

        return items;
    }

    private static string Text(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : string.Empty;

    public static string QueryText(SeedItem item, EvalScenario scenario) => scenario == EvalScenario.QuestionAnswer
        ? $"{item.Question} {item.Answer}"
        : $"{item.Question} {item.Answer} {item.Explanation}";

    /// <summary>
    /// Scores held-out items against models built without them. <paramref name="folds"/> picks which of the
    /// <see cref="Folds"/> folds to evaluate; <paramref name="stride"/> thins the queries within a fold.
    /// </summary>
    public static List<QueryOutcome> Run(
        IReadOnlyList<SeedItem> items,
        TopicSuggestionOptions options,
        TopicTextAnalyzer analyzer,
        EvalScenario scenario,
        IReadOnlyList<int> folds,
        int stride = 1,
        bool useItems = true)
    {
        TopicProfileItem[] profiles = items
            .AsParallel().AsOrdered()
            .Select(item => TopicProfileDocument.Create(analyzer, item.Category, item.L1, item.L2, item.Question, item.Answer, item.Explanation, options.ExplanationCap))
            .ToArray();

        List<QueryOutcome> outcomes = [];
        foreach (int fold in folds)
        {
            IEnumerable<TopicProfileItem> training = useItems
                ? profiles.Where((_, index) => index % Folds != fold)
                : [];
            TopicSuggestionModel model = TopicSuggestionModel.Build(Registry, options, analyzer, training);

            List<(SeedItem Truth, string Text)> queries = scenario == EvalScenario.Notes
                ? NotesQueries(items, fold)
                : items
                    .Select((item, index) => (item, index))
                    .Where(entry => entry.index % Folds == fold && (entry.index / Folds) % stride == 0)
                    .Select(entry => (entry.item, QueryText(entry.item, scenario)))
                    .ToList();

            QueryOutcome[] scored = new QueryOutcome[queries.Count];
            Parallel.For(0, queries.Count, index =>
            {
                (SeedItem truth, string text) = queries[index];
                scored[index] = ScoreQuery(model, analyzer, options, truth, text);
            });
            outcomes.AddRange(scored);
        }

        return outcomes;
    }

    public static QueryOutcome ScoreQuery(TopicSuggestionModel model, TopicTextAnalyzer analyzer, TopicSuggestionOptions options, SeedItem truth, string text)
    {
        List<string> stems = analyzer.Analyze(text).Select(token => token.Stem).ToList();
        if (stems.Distinct(StringComparer.Ordinal).Count() < options.MinTerms)
        {
            return new QueryOutcome(truth, truth.Question, 0, false, []);
        }

        TopicScoreOutcome outcome = model.Score(stems);
        return new QueryOutcome(truth, truth.Question, outcome.Confidence, true, outcome.Paths);
    }

    private static List<(SeedItem, string)> NotesQueries(IReadOnlyList<SeedItem> items, int fold)
    {
        List<(SeedItem, string)> queries = [];
        IEnumerable<IGrouping<(string, string, string), SeedItem>> groups = items
            .Where((_, index) => index % Folds == fold)
            .GroupBy(item => (item.Category, item.L1, item.L2));
        foreach (IGrouping<(string, string, string), SeedItem> group in groups)
        {
            foreach (SeedItem[] chunk in group.Chunk(5))
            {
                if (chunk.Length >= 3)
                {
                    queries.Add((chunk[0], string.Join(" ", chunk.Select(item => QueryText(item, EvalScenario.QuestionAnswerExplanation)))));
                }
            }
        }

        return queries;
    }

    public static EvalMetrics Metrics(IReadOnlyList<QueryOutcome> outcomes, double threshold)
    {
        if (outcomes.Count == 0)
        {
            return new EvalMetrics(0, 0, 0, 0, 0, 0, 0, 0);
        }

        int answered = 0;
        int category1 = 0;
        int l1At3 = 0;
        int l2At1 = 0;
        int l2At5 = 0;
        double mrr = 0;
        foreach (QueryOutcome outcome in outcomes)
        {
            if (!IsAnswered(outcome, threshold))
            {
                continue;
            }

            answered++;
            SeedItem truth = outcome.Truth;
            IReadOnlyList<TopicPathScore> paths = outcome.Paths;
            if (paths[0].Category == truth.Category)
            {
                category1++;
            }

            if (paths.Take(3).Any(path => path.Category == truth.Category && path.L1 == truth.L1))
            {
                l1At3++;
            }

            if (paths[0].Category == truth.Category && paths[0].L1 == truth.L1 && paths[0].L2 == truth.L2)
            {
                l2At1++;
            }

            if (paths.Take(ReportedLimit).Any(path => path.Category == truth.Category && path.L1 == truth.L1 && path.L2 == truth.L2))
            {
                l2At5++;
            }

            int rank = paths.ToList().FindIndex(path => path.Category == truth.Category && path.L1 == truth.L1);
            if (rank >= 0)
            {
                mrr += 1.0 / (rank + 1);
            }
        }

        double total = outcomes.Count;
        return new EvalMetrics(
            outcomes.Count,
            answered / total,
            category1 / total,
            l1At3 / total,
            l2At1 / total,
            l2At5 / total,
            mrr / total,
            answered == 0 ? 0 : l1At3 / (double)answered);
    }

    public static bool IsAnswered(QueryOutcome outcome, double threshold) =>
        outcome.Attempted && outcome.Paths.Count > 0 && outcome.Confidence >= threshold;
}
