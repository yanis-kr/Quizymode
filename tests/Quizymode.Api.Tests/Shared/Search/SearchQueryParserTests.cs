using FluentAssertions;
using Quizymode.Api.Shared.Search;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Search;

public sealed class SearchQueryParserTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("!!! ??? ()")]
    public void Parse_NoSearchableToken_IsNotSearchable(string? raw)
    {
        ParsedSearchQuery parsed = SearchQueryParser.Parse(raw);

        parsed.IsSearchable.Should().BeFalse();
        parsed.Tokens.Should().BeEmpty();
    }

    [Fact]
    public void Parse_LastWordIsPrefix_AndHeadHoldsTheRest()
    {
        ParsedSearchQuery parsed = SearchQueryParser.Parse("photosynthesis chlor");

        parsed.Head.Should().Be("photosynthesis");
        parsed.PrefixToken.Should().Be("chlor");
        parsed.Tokens.Should().Equal("photosynthesis", "chlor");
        SearchQueryParser.ToPrefixTsQueryValue(parsed.PrefixToken!).Should().Be("chlor:*");
    }

    [Fact]
    public void Parse_SingleWord_HasNoHead()
    {
        ParsedSearchQuery parsed = SearchQueryParser.Parse("Learn");

        parsed.Head.Should().BeNull();
        parsed.PrefixToken.Should().Be("learn");
        parsed.IsSearchable.Should().BeTrue();
        SearchQueryParser.BuildTsQuerySql(parsed, "@Head", "@Prefix").Should().Be("to_tsquery('english', @Prefix)");
    }

    [Fact]
    public void Parse_TrailingWhitespace_MeansTheWordIsFinished()
    {
        ParsedSearchQuery parsed = SearchQueryParser.Parse("photosynthesis ");

        parsed.Head.Should().Be("photosynthesis");
        parsed.PrefixToken.Should().BeNull();
        SearchQueryParser.BuildTsQuerySql(parsed, "@Head", "@Prefix").Should().Be("websearch_to_tsquery('english', @Head)");
    }

    [Fact]
    public void Parse_HeadAndPrefix_CombineWithAnd()
    {
        ParsedSearchQuery parsed = SearchQueryParser.Parse("cell memb");

        SearchQueryParser.BuildTsQuerySql(parsed, "@Head", "@Prefix")
            .Should().Be("(websearch_to_tsquery('english', @Head) && to_tsquery('english', @Prefix))");
    }

    [Theory]
    [InlineData("\"cell memb")]
    [InlineData("cell -memb")]
    [InlineData("-memb")]
    public void Parse_InsideOpenQuoteOrNegated_NeverUsesPrefix(string raw)
    {
        SearchQueryParser.Parse(raw).PrefixToken.Should().BeNull();
    }

    [Fact]
    public void Parse_QuotesAndExcludesStayInHead()
    {
        ParsedSearchQuery parsed = SearchQueryParser.Parse("\"cell membrane\" -plant ");

        parsed.Head.Should().Be("\"cell membrane\" -plant");
        parsed.PrefixToken.Should().BeNull();
        parsed.HasPositiveTerm.Should().BeTrue();
    }

    [Theory]
    [InlineData("-plant")]
    [InlineData("-plant -animal ")]
    [InlineData("-\"cell membrane\" ")]
    public void Parse_OnlyNegatedTerms_HasNoPositiveTerm(string raw)
    {
        ParsedSearchQuery parsed = SearchQueryParser.Parse(raw);

        parsed.HasPositiveTerm.Should().BeFalse();
        parsed.IsSearchable.Should().BeFalse();
    }

    [Theory]
    [InlineData("a! | (b: c' ")]
    [InlineData("x & y <-> z ")]
    [InlineData("foo:* ")]
    public void Parse_TsQueryMetacharacters_NeverReachThePrefixParameter(string raw)
    {
        ParsedSearchQuery parsed = SearchQueryParser.Parse(raw);

        parsed.PrefixToken.Should().BeNull();
    }

    [Theory]
    [InlineData("(foo|bar")]
    [InlineData("a:b")]
    [InlineData("a&b")]
    public void Parse_PrefixIsAlwaysAPlainLetterDigitRun(string raw)
    {
        string? prefix = SearchQueryParser.Parse(raw).PrefixToken;

        if (prefix is not null)
        {
            prefix.Should().MatchRegex(@"^[\p{L}\p{N}]+$");
        }
    }

    [Fact]
    public void Parse_NonAsciiTokensAreKept()
    {
        SearchQueryParser.Parse("café").PrefixToken.Should().Be("café");
        SearchQueryParser.Parse("日本").PrefixToken.Should().Be("日本");
        SearchQueryParser.Parse("😀word").Tokens.Should().Equal("word");
        SearchQueryParser.Parse("½ ² ").IsSearchable.Should().BeFalse();
    }

    [Fact]
    public void Parse_LimitsTokensToEightAndTokenLengthToForty()
    {
        ParsedSearchQuery many = SearchQueryParser.Parse("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10 ");
        many.Tokens.Should().HaveCount(8);
        many.PrefixToken.Should().BeNull();

        ParsedSearchQuery longToken = SearchQueryParser.Parse(new string('x', 100) + " ");
        longToken.Tokens.Single().Should().HaveLength(40);
        longToken.Head.Should().HaveLength(40);
    }

    [Fact]
    public void BuildTsQuerySql_WithNothing_Throws()
    {
        Action act = () => SearchQueryParser.BuildTsQuerySql(SearchQueryParser.Parse("!!"), "@Head", "@Prefix");

        act.Should().Throw<InvalidOperationException>();
    }
}
