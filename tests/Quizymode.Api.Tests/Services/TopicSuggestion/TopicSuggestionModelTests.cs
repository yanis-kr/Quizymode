using FluentAssertions;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Quizymode.Api.Shared.Taxonomy;
using Xunit;

namespace Quizymode.Api.Tests.Services.TopicSuggestion;

/// <summary>#322: BM25 scoring, the L2 to L1 roll-up and the distinct-L1 chip rule on a toy taxonomy.</summary>
public sealed class TopicSuggestionModelTests
{
    private static readonly TopicTextAnalyzer Analyzer = new();
    private static readonly TopicSuggestionOptions Options = new();

    private static TaxonomyCategoryDefinition Category(
        string slug,
        string description,
        params (string L1, string L1Description, (string L2, string Description)[] Leaves)[] groups)
    {
        List<TaxonomyL1Group> l1Groups = groups
            .Select(group => new TaxonomyL1Group
            {
                Slug = group.L1,
                Description = group.L1Description,
                L2Leaves = group.Leaves.Select(leaf => new TaxonomyL2Leaf { Slug = leaf.L2, Description = leaf.Description }).ToList()
            })
            .ToList();
        return new TaxonomyCategoryDefinition
        {
            Slug = slug,
            Description = description,
            L1Groups = l1Groups,
            AllKeywordSlugs = l1Groups.Select(group => group.Slug)
                .Concat(l1Groups.SelectMany(group => group.L2Leaves.Select(leaf => leaf.Slug)))
                .ToHashSet()
        };
    }

    internal static TaxonomyRegistry ToyRegistry()
    {
        Dictionary<string, TaxonomyCategoryDefinition> categories = new()
        {
            ["tech"] = Category(
                "tech",
                "Technology and software",
                ("ai-ml", "AI and ML", [("deep-learning", "Neural nets"), ("llms", "Large language models")]),
                ("databases", "Data stores", [("sql", "Relational queries"), ("nosql", "Document stores")])),
            ["cooking"] = Category(
                "cooking",
                "Food and recipes",
                ("baking", "Ovens and dough", [("bread", "Loaves and dough"), ("pastry", "Tarts and croissants")]))
        };
        return new TaxonomyRegistry(categories);
    }

    private static TopicProfileItem Item(string category, string l1, string l2, string question, string answer = "", string explanation = "") =>
        TopicProfileDocument.Create(Analyzer, category, l1, l2, question, answer, explanation, 500);

    private static List<string> Stems(string text) => Analyzer.Analyze(text).Select(token => token.Stem).ToList();

    private static TopicSuggestionModel Build(params TopicProfileItem[] items) =>
        TopicSuggestionModel.Build(ToyRegistry(), Options, Analyzer, items);

    [Fact]
    public void Score_TaxonomyTextAlone_FindsTheMatchingLeaf()
    {
        TopicScoreOutcome outcome = Build().Score(Stems("Which neural nets are used"));

        outcome.Paths.Should().NotBeEmpty();
        outcome.Paths[0].Should().Match<TopicPathScore>(path => path.Category == "tech" && path.L1 == "ai-ml" && path.L2 == "deep-learning");
    }

    [Fact]
    public void Score_ItemText_BeatsTaxonomyTextWhenItemsMatch()
    {
        TopicSuggestionModel model = Build(
            Item("tech", "databases", "sql", "How does a join combine rows from two tables", "It matches rows by a key"),
            Item("tech", "databases", "sql", "What does the group by clause do to rows", "It aggregates rows"),
            Item("tech", "databases", "nosql", "Why shard a collection of documents", "To spread the load"));

        TopicScoreOutcome outcome = model.Score(Stems("join rows from two tables with a key"));

        outcome.Paths[0].Should().Match<TopicPathScore>(path => path.L1 == "databases" && path.L2 == "sql");
        outcome.Confidence.Should().BeGreaterThan(Options.ConfidenceThreshold);
    }

    [Fact]
    public void Score_OffersAtMostOneChipPerL1_BestLeafFirst()
    {
        TopicSuggestionModel model = Build(
            Item("tech", "ai-ml", "deep-learning", "How do neural network weights learn through backpropagation"),
            Item("tech", "ai-ml", "llms", "How does a language model predict the next token"));

        TopicScoreOutcome outcome = model.Score(Stems("neural network weights backpropagation language model"));

        outcome.Paths.Count(path => path.L1 == "ai-ml").Should().Be(1);
        outcome.Paths.Select(path => (path.Category, path.L1)).Should().OnlyHaveUniqueItems();
        outcome.Paths[0].L2.Should().Be("deep-learning");
    }

    [Fact]
    public void Score_RollsLeafScoresUpToTheParentL1()
    {
        // Both leaves of baking mention dough somewhere, so the L1 scores strongly even though no single leaf dominates.
        TopicSuggestionModel model = Build(
            Item("cooking", "baking", "bread", "Why does dough need time to rise before the oven"),
            Item("cooking", "baking", "pastry", "How cold should butter be for flaky dough"),
            Item("tech", "databases", "sql", "What is dough"));

        TopicScoreOutcome outcome = model.Score(Stems("dough rise butter oven"));

        outcome.Paths[0].Category.Should().Be("cooking");
        outcome.Paths[0].L1.Should().Be("baking");
    }

    [Fact]
    public void Score_UnknownTerms_ReturnNoPathsAndZeroConfidence()
    {
        TopicScoreOutcome outcome = Build().Score(Stems("zzqxv qwertyuiop"));

        outcome.Paths.Should().BeEmpty();
        outcome.Confidence.Should().Be(0);
    }

    [Fact]
    public void Score_ScoresAreWithinZeroAndOne_AndSortedDescending()
    {
        TopicScoreOutcome outcome = Build(
            Item("tech", "ai-ml", "llms", "language model tokens and prompts"),
            Item("cooking", "baking", "bread", "language of dough")).Score(Stems("language model dough tokens"));

        outcome.Paths.Should().OnlyContain(path => path.Score > 0 && path.Score <= 1.0001);
        outcome.Paths.Select(path => path.Score).Should().BeInDescendingOrder();
    }

    [Fact]
    public void Score_TiesBreakByPublicItemCountThenTaxonomyOrder()
    {
        TopicSuggestionModel balanced = Build(
            Item("cooking", "baking", "bread", "knead"),
            Item("cooking", "baking", "pastry", "knead"));
        balanced.Score(Stems("knead flour")).Paths[0].L2.Should().Be("bread");

        TopicSuggestionModel heavier = Build(
            Item("cooking", "baking", "bread", "knead"),
            Item("cooking", "baking", "pastry", "knead"),
            Item("cooking", "baking", "pastry", "knead"));
        heavier.Score(Stems("knead flour")).Paths[0].L2.Should().Be("pastry");
    }

    [Fact]
    public void Build_IgnoresItemsForUnknownPaths()
    {
        TopicSuggestionModel model = Build(
            Item("tech", "ai-ml", "not-a-leaf", "unmatchableword unmatchableword2"),
            Item("nope", "x", "y", "unmatchableword"));

        model.ProfileItemCount.Should().Be(0);
        model.Score(Stems("unmatchableword unmatchableword2")).Paths.Should().BeEmpty();
    }

    [Fact]
    public void Score_RepeatedTermsAreDamped()
    {
        TopicSuggestionModel model = Build(
            Item("cooking", "baking", "bread", "knead dough"),
            Item("tech", "databases", "sql", "join rows"));

        // Seven repeats weigh sqrt(3), not 7, so the other term still shows up.
        TopicScoreOutcome spammed = model.Score(Stems("knead knead knead knead knead knead knead join"));

        spammed.Paths.Should().Contain(path => path.L1 == "databases");
    }

    [Fact]
    public void L2Contains_ReportsTermsOfTheLeafDocument()
    {
        TopicSuggestionModel model = Build(Item("cooking", "baking", "bread", "sourdough starter"));
        TopicPathScore bread = model.Score(Stems("sourdough")).Paths[0];

        model.L2Contains(bread.L2Index, "sourdough").Should().BeTrue();
        model.L2Contains(bread.L2Index, "starter").Should().BeTrue();
        model.L2Contains(bread.L2Index, "database").Should().BeFalse();
    }

    [Fact]
    public void ProfileDocument_AppliesTheExplanationCap()
    {
        string explanation = "alpha " + new string('x', 20) + " omega";

        TopicProfileItem capped = TopicProfileDocument.Create(Analyzer, "tech", "ai-ml", "llms", "q", "a", explanation, 8);
        TopicProfileItem uncapped = TopicProfileDocument.Create(Analyzer, "tech", "ai-ml", "llms", "q", "a", explanation, 500);
        TopicProfileItem none = TopicProfileDocument.Create(Analyzer, "tech", "ai-ml", "llms", "q", "a", explanation, 0);

        capped.Terms.Should().Contain("alpha").And.NotContain("omega");
        uncapped.Terms.Should().Contain("omega");
        none.Terms.Should().NotContain("alpha");
    }
}
