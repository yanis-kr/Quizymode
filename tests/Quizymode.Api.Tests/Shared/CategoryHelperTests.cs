using FluentAssertions;
using Quizymode.Api.Shared.Helpers;
using Xunit;

namespace Quizymode.Api.Tests.Shared;

public sealed class CategoryHelperTests
{
    [Fact]
    public void NameToSlug_ReturnsEmpty_ForBlankInput()
    {
        CategoryHelper.NameToSlug("   ").Should().BeEmpty();
    }

    [Fact]
    public void NameToSlug_NormalizesWhitespace_Punctuation_AndRepeatedDashes()
    {
        CategoryHelper.NameToSlug("  AP Biology & Chemistry -- Lab  ")
            .Should()
            .Be("ap-biology-chemistry-lab");
    }

    [Fact]
    public void Normalize_ReturnsEmpty_ForBlankInput()
    {
        CategoryHelper.Normalize("").Should().BeEmpty();
        CategoryHelper.Normalize("   ").Should().BeEmpty();
    }

    [Fact]
    public void Normalize_HandlesSingleLetter_AndMixedCaseWords()
    {
        CategoryHelper.Normalize("q").Should().Be("Q");
        CategoryHelper.Normalize("   SPANISH   ").Should().Be("Spanish");
    }
}
