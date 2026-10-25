using FluentAssertions;
using Quizymode.Api.Shared.Text;
using Xunit;

namespace Quizymode.Api.Tests.Shared;

public sealed class EnglishStemmerTests
{
    [Theory]
    [InlineData("networks", "network")]
    [InlineData("networking", "network")]
    [InlineData("networked", "network")]
    [InlineData("network", "network")]
    [InlineData("learning", "learn")]
    [InlineData("learned", "learn")]
    [InlineData("learns", "learn")]
    [InlineData("running", "run")]
    [InlineData("queries", "query")]
    [InlineData("query", "query")]
    [InlineData("boxes", "box")]
    [InlineData("classes", "class")]
    [InlineData("class", "class")]
    [InlineData("processing", "process")]
    [InlineData("quickly", "quick")]
    [InlineData("stored", "stor")]
    [InlineData("store", "stor")]
    [InlineData("databases", "databas")]
    [InlineData("database", "databas")]
    [InlineData("analysis", "analysis")]
    [InlineData("thing", "thing")]
    [InlineData("bus", "bus")]
    [InlineData("ai", "ai")]
    [InlineData("s3", "s3")]
    [InlineData("ec2", "ec2")]
    [InlineData("saa", "saa")]
    [InlineData("c03", "c03")]
    public void Stem_ReducesInflectionsToOneTerm(string word, string expected)
    {
        EnglishStemmer.Stem(word).Should().Be(expected);
    }

    [Fact]
    public void StopWords_ContainFunctionWordsButNotTopicWords()
    {
        EnglishStopWords.Contains("the").Should().BeTrue();
        EnglishStopWords.Contains("because").Should().BeTrue();
        EnglishStopWords.Contains("network").Should().BeFalse();
        EnglishStopWords.Contains("ai").Should().BeFalse();
    }
}
