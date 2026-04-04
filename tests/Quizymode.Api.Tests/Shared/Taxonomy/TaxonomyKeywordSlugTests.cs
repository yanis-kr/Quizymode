using FluentAssertions;
using Quizymode.Api.Shared.Taxonomy;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Taxonomy;

public sealed class TaxonomyKeywordSlugTests
{
    [Fact]
    public void FromName_EmptyString_ReturnsEmpty()
    {
        TaxonomyKeywordSlug.FromName("").Should().Be(string.Empty);
    }

    [Fact]
    public void FromName_WhitespaceOnly_ReturnsEmpty()
    {
        TaxonomyKeywordSlug.FromName("   ").Should().Be(string.Empty);
    }

    [Fact]
    public void FromName_SimpleName_ReturnsLowercase()
    {
        TaxonomyKeywordSlug.FromName("Biology").Should().Be("biology");
    }

    [Fact]
    public void FromName_NameWithSpaces_ReplacesWithHyphens()
    {
        TaxonomyKeywordSlug.FromName("World War Two").Should().Be("world-war-two");
    }

    [Fact]
    public void FromName_MultipleSpaces_SingleHyphen()
    {
        TaxonomyKeywordSlug.FromName("World  War").Should().Be("world-war");
    }

    [Fact]
    public void FromName_SpecialCharacters_Removed()
    {
        TaxonomyKeywordSlug.FromName("C++ programming").Should().Be("c-programming");
    }

    [Fact]
    public void FromName_WithLeadingAndTrailingSpaces_Trimmed()
    {
        TaxonomyKeywordSlug.FromName("  biology  ").Should().Be("biology");
    }

    [Fact]
    public void FromName_HyphensPreserved()
    {
        TaxonomyKeywordSlug.FromName("self-taught").Should().Be("self-taught");
    }

    [Fact]
    public void FromName_MultipleHyphens_Collapsed()
    {
        TaxonomyKeywordSlug.FromName("a--b").Should().Be("a-b");
    }

    [Fact]
    public void FromName_WithUnderscores_Preserved()
    {
        TaxonomyKeywordSlug.FromName("my_topic").Should().Be("my_topic");
    }

    [Fact]
    public void FromName_MixedCasing_Lowercased()
    {
        TaxonomyKeywordSlug.FromName("UPPER lower Mixed").Should().Be("upper-lower-mixed");
    }
}
