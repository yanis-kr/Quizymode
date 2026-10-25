using FluentAssertions;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Xunit;

namespace Quizymode.Api.Tests.Services.TopicSuggestion;

/// <summary>
/// #322 model-level quality over the real seed corpus (<c>data/seed-source</c>, 13.5k items) and the real taxonomy.
/// The HTTP tests use a tiny curated fixture; realistic accuracy is asserted here, without a database.
/// </summary>
public sealed class TopicSuggestionQualityTests
{
    private static readonly TopicSuggestionOptions Options = new();
    private static readonly TopicTextAnalyzer Analyzer = new();

    private static readonly Lazy<TopicSuggestionModel> FullModel = new(() => TopicSuggestionModel.Build(
        TopicEvalRunner.Registry,
        Options,
        Analyzer,
        TopicEvalRunner.Items.Select(item => TopicProfileDocument.Create(
            Analyzer, item.Category, item.L1, item.L2, item.Question, item.Answer, item.Explanation, Options.ExplanationCap))));

    private static void RequireCorpus() => Skip.If(TopicEvalRunner.Items.Count == 0, "data/seed-source/items was not found.");

    private static IReadOnlyList<TopicPathScore> Suggest(string text, int limit = 5)
    {
        List<string> stems = Analyzer.Analyze(text).Select(token => token.Stem).ToList();
        TopicScoreOutcome outcome = FullModel.Value.Score(stems);
        outcome.Confidence.Should().BeGreaterThanOrEqualTo(Options.ConfidenceThreshold, "the text is clearly about a topic");
        return outcome.Paths.Take(limit).ToList();
    }

    [SkippableFact]
    public void HeldOutFold_MeetsTheAccuracyGuard()
    {
        RequireCorpus();

        List<QueryOutcome> outcomes = TopicEvalRunner.Run(
            TopicEvalRunner.Items, Options, Analyzer, EvalScenario.QuestionAnswerExplanation, [0]);
        EvalMetrics metrics = TopicEvalRunner.Metrics(outcomes, Options.ConfidenceThreshold);

        metrics.Queries.Should().BeGreaterThan(1000);
        metrics.CategoryAt1.Should().BeGreaterThanOrEqualTo(0.88, "category should be right for nearly every item");
        metrics.L1At3.Should().BeGreaterThanOrEqualTo(0.85, "the true L1 should be among the first three chips");
        metrics.Coverage.Should().BeGreaterThan(0.98);
    }

    [SkippableFact]
    public void ArtificialIntelligenceNotes_SuggestTechAiMl()
    {
        RequireCorpus();

        IReadOnlyList<TopicPathScore> paths = Suggest(
            "Neural networks learn weights with backpropagation; deep learning models and machine learning training");

        paths.Take(3).Should().Contain(path => path.Category == "tech" && path.L1 == "ai-ml");
    }

    [SkippableFact]
    public void AwsServiceNotes_SuggestExamsAws()
    {
        RequireCorpus();

        IReadOnlyList<TopicPathScore> paths = Suggest("EC2 instances, S3 buckets and VPC subnets");

        paths.Take(3).Should().Contain(path => path.Category == "exams" && path.L1.StartsWith("aws", StringComparison.Ordinal));
    }

    [SkippableTheory]
    [InlineData("Photosynthesis converts light energy into chemical energy stored in glucose inside chloroplasts", "science")]
    [InlineData("The Treaty of Versailles ended the First World War and imposed reparations on Germany", "history")]
    [InlineData("How do you conjugate regular verbs in the Spanish present tense", "languages")]
    [InlineData("The goalkeeper saved the penalty kick in the football match", "sports")]
    [InlineData("A balance sheet lists assets, liabilities and shareholder equity for the accounting period", "business")]
    [InlineData("The river flows through several countries before reaching the sea; its capital is on the northern coast", "geography")]
    public void ClearTopicText_SuggestsTheRightCategoryFirst(string text, string category)
    {
        RequireCorpus();

        Suggest(text)[0].Category.Should().Be(category);
    }

    [SkippableFact]
    public void Gibberish_IsNotConfidentEnoughForTextSuggestions()
    {
        RequireCorpus();

        List<string> stems = Analyzer.Analyze("asdf qwer zxcv").Select(token => token.Stem).ToList();
        TopicScoreOutcome outcome = FullModel.Value.Score(stems);

        outcome.Paths.Should().BeEmpty();
    }

    [SkippableFact]
    public void EveryPathIsAValidSavableNavigationPath()
    {
        RequireCorpus();

        foreach (TopicPathScore path in Suggest("data structures algorithms sorting trees graphs complexity", limit: 10))
        {
            TopicEvalRunner.Registry.IsValidNavigationPath(path.Category, path.L1, path.L2).Should().BeTrue();
        }
    }
}
