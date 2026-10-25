using System.Diagnostics;
using System.Globalization;
using System.Text;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Xunit;

namespace Quizymode.Api.Tests.Services.TopicSuggestion;

/// <summary>
/// Opt-in evaluation report for #322 (<c>QM_TOPIC_EVAL=1</c>; write the markdown to <c>QM_TOPIC_EVAL_OUT</c>). It runs
/// 10-fold cross-validation over <c>data/seed-source</c> (13.5k items), so every query item is absent from the model that
/// scores it, then the ablations and the threshold sweep that selected the defaults in
/// <see cref="TopicSuggestionOptions"/>. It is skipped in normal runs and never touches a database.
/// </summary>
public sealed class TopicSuggestionEvalTests
{
    private static readonly int[] AllFolds = Enumerable.Range(0, TopicEvalRunner.Folds).ToArray();

    private static readonly string[] JunkTexts =
    [
        "hello how are you doing today",
        "asdf qwer zxcv",
        "remember to buy milk and eggs tomorrow",
        "lorem ipsum dolor sit amet consectetur",
        "this is a test of the system please ignore",
        "thanks for your help yesterday",
        "my favorite color is blue",
        "see you at the meeting on monday",
        "what time is it",
        "qwerty uiop hjkl bnm",
        "testing testing one two three",
        "random words without any subject at all",
        "hi there friend",
        "please send me the file when you can",
        "good morning everyone have a nice day",
        "zzzz xxxx yyyy wwww vvvv",
        "ok sounds good let us do that",
        "foo bar baz qux quux",
        "i am not sure what to write here",
        "nothing special just typing something"
    ];

    [SkippableFact]
    public void WriteEvaluationReport()
    {
        Skip.IfNot(Environment.GetEnvironmentVariable("QM_TOPIC_EVAL") == "1", "Set QM_TOPIC_EVAL=1 to run the topic suggestion evaluation.");
        Skip.If(TopicEvalRunner.Items.Count == 0, "data/seed-source/items was not found.");

        Stopwatch total = Stopwatch.StartNew();
        IReadOnlyList<SeedItem> items = TopicEvalRunner.Items;
        TopicSuggestionOptions defaults = new();
        TopicTextAnalyzer analyzer = new();
        StringBuilder report = new();

        report.AppendLine("# Topic suggestion evaluation (#322)");
        report.AppendLine();
        report.AppendLine(CultureInfo.InvariantCulture, $"- Date: {DateTime.UtcNow:yyyy-MM-dd}");
        report.AppendLine(CultureInfo.InvariantCulture, $"- Items: {items.Count} valid seed-source items (all eligible public paths), {Distinct(items.Select(i => (i.Category, i.L1, i.L2)))} L2 nodes covered");
        report.AppendLine(CultureInfo.InvariantCulture, $"- Method: {TopicEvalRunner.Folds}-fold cross-validation; a model is rebuilt per fold without the held-out items. Fallback answers count as misses (overall columns).");
        report.AppendLine(CultureInfo.InvariantCulture, $"- Defaults: k1={defaults.K1}, b={defaults.B}, alpha/beta/gamma={defaults.Alpha}/{defaults.Beta}/{defaults.Gamma}, slug x{defaults.SlugWeight}, description x{defaults.DescriptionWeight}, tau={defaults.ConfidenceThreshold}, min relative score={defaults.MinRelativeScore}, explanation cap={defaults.ExplanationCap}");
        report.AppendLine();

        // Headline: scenario (a), full CV.
        List<QueryOutcome> scenarioA = TopicEvalRunner.Run(items, defaults, analyzer, EvalScenario.QuestionAnswerExplanation, AllFolds);
        List<QueryOutcome> scenarioB = TopicEvalRunner.Run(items, defaults, analyzer, EvalScenario.QuestionAnswer, AllFolds);
        List<QueryOutcome> scenarioC = TopicEvalRunner.Run(items, defaults, analyzer, EvalScenario.Notes, AllFolds);
        double tau = defaults.ConfidenceThreshold;

        report.AppendLine("## Scenarios (default parameters)");
        report.AppendLine();
        AppendHeader(report, "Scenario");
        AppendRow(report, "(a) question + answer + explanation", TopicEvalRunner.Metrics(scenarioA, tau));
        AppendRow(report, "(b) question + answer", TopicEvalRunner.Metrics(scenarioB, tau));
        AppendRow(report, "(c) notes-like: up to 5 held-out items of one L2", TopicEvalRunner.Metrics(scenarioC, tau));
        report.AppendLine();
        report.AppendLine("Targets for (a): L1@3 >= 70 %, Cat@1 >= 90 %.");
        report.AppendLine();

        // Exact duplicate questions inflate cross-validation, so report the unique-question subset too.
        HashSet<string> duplicated = items
            .GroupBy(item => item.Question.Trim().ToLowerInvariant())
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToHashSet();
        List<QueryOutcome> uniqueOnly = scenarioA.Where(outcome => !duplicated.Contains(outcome.Truth.Question.Trim().ToLowerInvariant())).ToList();
        report.AppendLine("## Exact duplicate questions");
        report.AppendLine();
        report.AppendLine(CultureInfo.InvariantCulture, $"{duplicated.Count} questions occur more than once ({scenarioA.Count - uniqueOnly.Count} of the {scenarioA.Count} queries).");
        report.AppendLine();
        AppendHeader(report, "Scenario (a) subset");
        AppendRow(report, "all queries", TopicEvalRunner.Metrics(scenarioA, tau));
        AppendRow(report, "questions that occur once", TopicEvalRunner.Metrics(uniqueOnly, tau));
        report.AppendLine();

        report.AppendLine("## Per category, scenario (a)");
        report.AppendLine();
        AppendHeader(report, "Category");
        foreach (IGrouping<string, QueryOutcome> group in scenarioA.GroupBy(outcome => outcome.Truth.Category).OrderBy(group => group.Key, StringComparer.Ordinal))
        {
            AppendRow(report, group.Key, TopicEvalRunner.Metrics(group.ToList(), tau));
        }

        report.AppendLine();

        // Ablations on every 3rd query to keep the run short.
        report.AppendLine("## Ablations, scenario (a), every 3rd query");
        report.AppendLine();
        AppendHeader(report, "Variant");
        AppendRow(report, "default (combined, cap 500, stemmer)", TopicEvalRunner.Metrics(TopicEvalRunner.Run(items, defaults, analyzer, EvalScenario.QuestionAnswerExplanation, AllFolds, stride: 3), tau));
        List<QueryOutcome> taxonomyOnly = TopicEvalRunner.Run(items, defaults, analyzer, EvalScenario.QuestionAnswerExplanation, AllFolds, stride: 3, useItems: false);
        AppendRow(report, "taxonomy text only (no items), default tau (mostly falls back)", TopicEvalRunner.Metrics(taxonomyOnly, tau));
        AppendRow(report, "taxonomy text only (no items), no threshold", TopicEvalRunner.Metrics(taxonomyOnly, 0));
        foreach (int cap in new[] { 0, 300, 500, 100_000 })
        {
            TopicSuggestionOptions capped = new() { ExplanationCap = cap };
            long bytes = items.Sum(item => (long)item.Question.Length + item.Answer.Length + Math.Min(item.Explanation.Length, cap) + 40);
            AppendRow(
                report,
                string.Create(CultureInfo.InvariantCulture, $"explanation cap {(cap == 100_000 ? "full" : cap)} (about {bytes / 1_000_000.0:F1} MB per full load)"),
                TopicEvalRunner.Metrics(TopicEvalRunner.Run(items, capped, analyzer, EvalScenario.QuestionAnswerExplanation, AllFolds, stride: 3), tau));
        }

        AppendRow(report, "no stemmer", TopicEvalRunner.Metrics(TopicEvalRunner.Run(items, defaults, new TopicTextAnalyzer(useStemmer: false), EvalScenario.QuestionAnswerExplanation, AllFolds, stride: 3), tau));
        report.AppendLine();

        report.AppendLine("## Path weights (alpha / beta / gamma), scenario (a), every 3rd query");
        report.AppendLine();
        AppendHeader(report, "alpha / beta / gamma");
        foreach ((double alpha, double beta, double gamma) in new[] { (1.0, 0.0, 0.0), (0.7, 0.3, 0.0), (0.5, 0.35, 0.15), (0.4, 0.4, 0.2), (0.3, 0.5, 0.2), (0.2, 0.6, 0.2) })
        {
            TopicSuggestionOptions grid = new() { Alpha = alpha, Beta = beta, Gamma = gamma };
            AppendRow(report, string.Create(CultureInfo.InvariantCulture, $"{alpha} / {beta} / {gamma}"), TopicEvalRunner.Metrics(TopicEvalRunner.Run(items, grid, analyzer, EvalScenario.QuestionAnswerExplanation, AllFolds, stride: 3), tau));
        }

        report.AppendLine();
        report.AppendLine("## Taxonomy slug / description weights, scenario (a), every 3rd query");
        report.AppendLine();
        AppendHeader(report, "slug / description");
        foreach ((double slug, double description) in new[] { (1.0, 1.0), (3.0, 2.0), (6.0, 4.0), (10.0, 5.0) })
        {
            TopicSuggestionOptions weights = new() { SlugWeight = slug, DescriptionWeight = description };
            AppendRow(report, string.Create(CultureInfo.InvariantCulture, $"{slug} / {description}"), TopicEvalRunner.Metrics(TopicEvalRunner.Run(items, weights, analyzer, EvalScenario.QuestionAnswerExplanation, AllFolds, stride: 3), tau));
        }

        report.AppendLine();

        // Threshold sweep: accuracy against how often junk text is (wrongly) answered with a text suggestion.
        TopicSuggestionModel fullModel = TopicSuggestionModel.Build(
            TopicEvalRunner.Registry,
            defaults,
            analyzer,
            items.Select(item => TopicProfileDocument.Create(analyzer, item.Category, item.L1, item.L2, item.Question, item.Answer, item.Explanation, defaults.ExplanationCap)));
        SeedItem junkTruth = new("none", "none", "none", string.Empty, string.Empty, string.Empty);
        List<QueryOutcome> junk = JunkTexts.Select(text => TopicEvalRunner.ScoreQuery(fullModel, analyzer, defaults, junkTruth, text)).ToList();

        report.AppendLine("## Confidence threshold (tau) sweep");
        report.AppendLine();
        report.AppendLine("Junk accepted = share of 20 nonsense or chatter phrases that still get a text suggestion (lower is better).");
        report.AppendLine();
        report.AppendLine("| tau | (a) coverage | (a) L1@3 overall | (a) L1@3 when answered | (a) Cat@1 | (c) L1@3 | (c) coverage | junk accepted |");
        report.AppendLine("|---|---|---|---|---|---|---|---|");
        foreach (double candidate in new[] { 0.0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20, 0.30 })
        {
            EvalMetrics a = TopicEvalRunner.Metrics(scenarioA, candidate);
            EvalMetrics c = TopicEvalRunner.Metrics(scenarioC, candidate);
            double junkAccepted = junk.Count(outcome => TopicEvalRunner.IsAnswered(outcome, candidate)) / (double)junk.Count;
            report.AppendLine(CultureInfo.InvariantCulture, $"| {candidate:F2} | {Pct(a.Coverage)} | {Pct(a.L1At3)} | {Pct(a.L1At3WhenAnswered)} | {Pct(a.CategoryAt1)} | {Pct(c.L1At3)} | {Pct(c.Coverage)} | {Pct(junkAccepted)} |");
        }

        report.AppendLine();
        List<double> real = scenarioA.Select(outcome => outcome.Confidence).Order().ToList();
        report.AppendLine(CultureInfo.InvariantCulture, $"Confidence of scenario (a) queries: p5 {real[real.Count / 20]:F3}, p10 {real[real.Count / 10]:F3}, p25 {real[real.Count / 4]:F3}, median {real[real.Count / 2]:F3}.");
        report.AppendLine();
        report.AppendLine("Junk phrase confidences (answered phrases show their top path):");
        report.AppendLine();
        for (int index = 0; index < JunkTexts.Length; index++)
        {
            QueryOutcome outcome = junk[index];
            string top = outcome.Paths.Count > 0 ? $"{outcome.Paths[0].Category} > {outcome.Paths[0].L1} > {outcome.Paths[0].L2}" : "none";
            report.AppendLine(CultureInfo.InvariantCulture, $"- {outcome.Confidence:F3} (terms ok: {outcome.Attempted}) `{JunkTexts[index]}` -> {top}");
        }

        report.AppendLine();
        report.AppendLine(CultureInfo.InvariantCulture, $"Run time: {total.Elapsed.TotalSeconds:F0} s");

        string path = Environment.GetEnvironmentVariable("QM_TOPIC_EVAL_OUT") ?? Path.Combine(Path.GetTempPath(), "topic-suggestion-eval.md");
        File.WriteAllText(path, report.ToString());
    }

    private static int Distinct(IEnumerable<(string, string, string)> keys) => keys.Distinct().Count();

    private static string Pct(double value) => (value * 100).ToString("F1", CultureInfo.InvariantCulture) + " %";

    private static void AppendHeader(StringBuilder report, string first)
    {
        report.AppendLine($"| {first} | Queries | Coverage | Cat@1 | L1@3 | L1@3 when answered | L2@1 | L2@5 | L1 MRR |");
        report.AppendLine("|---|---|---|---|---|---|---|---|---|");
    }

    private static void AppendRow(StringBuilder report, string label, EvalMetrics metrics)
    {
        report.AppendLine(CultureInfo.InvariantCulture, $"| {label} | {metrics.Queries} | {Pct(metrics.Coverage)} | {Pct(metrics.CategoryAt1)} | {Pct(metrics.L1At3)} | {Pct(metrics.L1At3WhenAnswered)} | {Pct(metrics.L2At1)} | {Pct(metrics.L2At5)} | {metrics.L1Mrr.ToString("F3", CultureInfo.InvariantCulture)} |");
    }
}
