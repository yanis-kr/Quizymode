using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Shared.Taxonomy;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>#319: in-memory topic search over the real taxonomy YAML.</summary>
public sealed class TaxonomySearchIndexTests
{
    private static readonly TaxonomyRegistry Registry = new(
        new TestHostEnvironment(),
        Options.Create(new TaxonomyOptions()),
        NullLogger<TaxonomyRegistry>.Instance);

    private static TaxonomySearchIndex CreateIndex() => new(Registry);

    [Theory]
    [InlineData("artificial")]
    [InlineData("artifical")]
    [InlineData("intelligence")]
    [InlineData("artificial intelligence")]
    [InlineData("Artificial Intelligence")]
    public void Search_AiWordsAndTypo_ReturnTechAiMlAsTopSubcategory(string query)
    {
        IReadOnlyList<TaxonomySearchHit> hits = CreateIndex().Search(query, TaxonomyNodeLevels.Subcategories, 5, 0);

        hits.Should().NotBeEmpty();
        hits[0].Node.CategorySlug.Should().Be("tech");
        hits[0].Node.L1Slug.Should().Be("ai-ml");
        hits[0].Node.L2Slug.Should().BeNull();
    }

    [Fact]
    public void Search_NegatedToken_IsSkippedSoExclusionNeverAddsAMatch()
    {
        TaxonomySearchIndex index = CreateIndex();

        index.Search("-ai", TaxonomyNodeLevels.Subcategories, 5, 0).Should().BeEmpty();
        index.Search("tech -zzzz", TaxonomyNodeLevels.Category, 5, 0)
            .Should().BeEquivalentTo(index.Search("tech", TaxonomyNodeLevels.Category, 5, 0));
        index.Search("artificial -intelligence", TaxonomyNodeLevels.Subcategories, 5, 0)
            .Should().BeEquivalentTo(index.Search("artificial", TaxonomyNodeLevels.Subcategories, 5, 0));
    }

    [Fact]
    public void Search_Categories_OnlyReturnsCategoryNodes()
    {
        IReadOnlyList<TaxonomySearchHit> hits = CreateIndex().Search("tech", TaxonomyNodeLevels.Category, 5, 0);

        hits.Should().NotBeEmpty();
        hits.Should().OnlyContain(hit => hit.Node.Level == TaxonomyNodeLevels.Category);
        hits[0].Node.CategorySlug.Should().Be("tech");
    }

    [Fact]
    public void Nodes_ContainEveryCategoryAndKeepDuplicateSlugsDistinctPerCategory()
    {
        TaxonomySearchIndex index = CreateIndex();

        index.Nodes.Count(node => node.Level == TaxonomyNodeLevels.Category).Should().Be(Registry.CategorySlugs.Count);
        IEnumerable<TaxonomySearchNode> general = index.Nodes.Where(node => node.Level == TaxonomyNodeLevels.L1 && node.L1Slug == "general");
        general.Select(node => node.CategorySlug).Should().OnlyHaveUniqueItems();
        general.Should().HaveCountGreaterThan(1);
        foreach (TaxonomySearchNode node in general)
        {
            index.Find(node.CategorySlug, "general", null).Should().Be(node);
        }
    }

    [Fact]
    public void Search_RanksNodesWithItemsAboveEmptyNodesWhenScoresTie()
    {
        TaxonomySearchIndex index = CreateIndex();
        List<TaxonomySearchHit> before = index.Search("general", TaxonomyNodeLevels.L1, 50, 0).ToList();
        before.Count.Should().BeGreaterThan(2);
        TaxonomySearchNode last = before[^1].Node;

        // Give the node that currently ranks last an item count: it must move to the front of its tie group.
        index.ReplaceCounts(
            new Dictionary<(string Category, string? L1, string? L2), int> { [(last.CategorySlug, last.L1Slug, last.L2Slug)] = 7 },
            DateTimeOffset.UtcNow);

        IReadOnlyList<TaxonomySearchHit> after = index.Search("general", TaxonomyNodeLevels.L1, 50, 0);
        after[0].Node.CategorySlug.Should().Be(last.CategorySlug);
        after[0].Node.PublicItemCount.Should().Be(7);
        after.Skip(1).Should().OnlyContain(hit => hit.Node.PublicItemCount == 0);
        index.CountsRefreshedAtUtc.Should().NotBeNull();
    }

    [Fact]
    public void ReplaceCounts_UpdatesFindAndNodes()
    {
        TaxonomySearchIndex index = CreateIndex();
        index.Find("tech", "ai-ml", null)!.PublicItemCount.Should().Be(0);

        index.ReplaceCounts(
            new Dictionary<(string Category, string? L1, string? L2), int>
            {
                [("tech", null, null)] = 40,
                [("tech", "ai-ml", null)] = 12
            },
            DateTimeOffset.UtcNow);

        index.Find("tech", null, null)!.PublicItemCount.Should().Be(40);
        index.Find("tech", "ai-ml", null)!.PublicItemCount.Should().Be(12);
        index.Nodes.Single(node => node.Level == TaxonomyNodeLevels.L1 && node.CategorySlug == "tech" && node.L1Slug == "ai-ml")
            .PublicItemCount.Should().Be(12);
    }

    [Fact]
    public void Search_AliasExpandsLlmsToLargeLanguageModels()
    {
        IReadOnlyList<TaxonomySearchHit> hits = CreateIndex().Search("large language models", TaxonomyNodeLevels.L2, 10, 0);

        hits.Should().Contain(hit => hit.Node.CategorySlug == "tech" && hit.Node.L1Slug == "ai-ml" && hit.Node.L2Slug == "llms");
    }

    [Fact]
    public void Search_RespectsLimitAndOffset()
    {
        TaxonomySearchIndex index = CreateIndex();
        List<TaxonomySearchHit> all = index.Search("general", TaxonomyNodeLevels.All, 100, 0).ToList();
        all.Count.Should().BeGreaterThan(4);

        index.Search("general", TaxonomyNodeLevels.All, 2, 0).Select(hit => hit.Node).Should().Equal(all.Take(2).Select(hit => hit.Node));
        index.Search("general", TaxonomyNodeLevels.All, 2, 2).Select(hit => hit.Node).Should().Equal(all.Skip(2).Take(2).Select(hit => hit.Node));
        index.Search("general", TaxonomyNodeLevels.All, 0, 0).Should().BeEmpty();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("!!! ???")]
    [InlineData("zzzzqqqqxxxx")]
    public void Search_NoUsableTokenOrNoMatch_ReturnsEmpty(string query)
    {
        CreateIndex().Search(query, TaxonomyNodeLevels.All, 5, 0).Should().BeEmpty();
    }

    [Fact]
    public void Search_EveryTokenMustMatch()
    {
        CreateIndex().Search("artificial zzzzqqqqxxxx", TaxonomyNodeLevels.All, 5, 0).Should().BeEmpty();
    }

    [Theory]
    [InlineData("artifical", "artificial", true)]
    [InlineData("artificial", "artificiall", true)]
    [InlineData("artificial", "artificlal", true)]
    [InlineData("artificial", "artficiall", false)]
    [InlineData("abcd", "abce", true)]
    [InlineData("abcd", "abef", false)]
    public void IsWithinOneEdit_HandlesInsertDeleteAndSubstitute(string a, string b, bool expected)
    {
        TaxonomySearchIndex.IsWithinOneEdit(a, b).Should().Be(expected);
    }

    [Fact]
    public void Tokenize_LowercasesAndSplitsOnNonAlphanumerics()
    {
        TaxonomySearchIndex.Tokenize("AI-ML, c++ & 3D!").Should().Equal("ai", "ml", "c", "3d");
    }

    [Fact]
    public void Aliases_ExpandSingleTokensOnly()
    {
        TaxonomySearchAliases.Expand("ai").Should().Equal("artificial", "intelligence");
        TaxonomySearchAliases.Expand("llms").Should().Equal("large", "language", "models");
        TaxonomySearchAliases.Expand("ci").Should().Equal("continuous", "integration");
        TaxonomySearchAliases.Expand("cd").Should().Equal("continuous", "delivery");
        TaxonomySearchAliases.Expand("unknownword").Should().BeEmpty();
        TaxonomySearchAliases.Count.Should().Be(17);
    }
}
