using FluentAssertions;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Xunit;

namespace Quizymode.Api.Tests.Services.TopicSuggestion;

public sealed class TopicTextAnalyzerTests
{
    private static readonly TopicTextAnalyzer Analyzer = new();

    private static List<string> Stems(string text, bool trusted = false) =>
        Analyzer.Analyze(text, trusted).Select(token => token.Stem).ToList();

    [Fact]
    public void Analyze_DropsStopWordsAndSingleLetters_AndStems()
    {
        Stems("The networks are learning a lot of things").Should().Equal("network", "learn", "lot", "thing");
    }

    [Fact]
    public void Analyze_KeepsShortTechTokensWithDigitsOrAliasKeys()
    {
        Stems("EC2 and S3 buckets").Should().Contain(["ec2", "s3", "bucket"]);
        Stems("ai ml").Should().Equal("ai", "ml");
    }

    [Fact]
    public void Analyze_DropsOtherTwoLetterWords()
    {
        Stems("go to xy").Should().BeEmpty();
    }

    [Fact]
    public void Analyze_ExpandsLongAliasesAnywhere()
    {
        Stems("llms and aws").Should().Contain(["llm", "larg", "languag", "model", "aws", "amazon", "web", "servic"]);
    }

    [Fact]
    public void Analyze_ExpandsTwoLetterAliasesOnlyWhenWrittenInCapitals()
    {
        Stems("the OS scheduler").Should().Contain("operat");
        Stems("the os scheduler").Should().NotContain("operat");
        Stems("Os scheduler").Should().NotContain("operat");
        Stems("AI research").Should().Contain(["artificial", "intelligenc"]);
        Stems("ai research").Should().NotContain("artificial");
    }

    [Fact]
    public void Analyze_TrustedTaxonomyText_ExpandsTwoLetterAliasesFromLowercaseSlugs()
    {
        Stems("ai-ml", trusted: true).Should().Contain(["artificial", "intelligenc", "machin"]);
    }

    [Fact]
    public void Analyze_ExpansionKeepsTheInputWordAsSurface()
    {
        Analyzer.Analyze("AWS").Select(token => token.Surface).Should().OnlyContain(surface => surface == "aws");
    }

    [Fact]
    public void Analyze_WithoutStemmer_KeepsWordsAsTyped()
    {
        new TopicTextAnalyzer(useStemmer: false).Analyze("networks").Single().Stem.Should().Be("networks");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("... !!!")]
    public void Analyze_EmptyInput_ReturnsNothing(string? text)
    {
        Analyzer.Analyze(text).Should().BeEmpty();
    }
}
