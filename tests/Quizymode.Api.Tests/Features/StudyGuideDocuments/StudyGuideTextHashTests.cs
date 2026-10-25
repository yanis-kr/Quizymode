using FluentAssertions;
using Quizymode.Api.Features.StudyGuideDocuments.Extraction;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

/// <summary>Pins the section/document duplicate-detection hash so stored hashes (including those from the retired AC 6.5 flow) stay comparable.</summary>
public sealed class StudyGuideTextHashTests
{
    [Fact]
    public void ComputeHash_MatchesPinnedSha256Vector()
    {
        StudyGuideTextHash.ComputeHash("hello world")
            .Should().Be("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    }

    [Fact]
    public void ComputeHash_IgnoresWhitespaceAndCaseDifferences()
    {
        string expected = StudyGuideTextHash.ComputeHash("hello world");

        StudyGuideTextHash.ComputeHash("  Hello \t\r\n  WORLD \n").Should().Be(expected);
    }

    [Fact]
    public void Normalize_CollapsesWhitespaceTrimsAndLowercases()
    {
        StudyGuideTextHash.Normalize("  The  Quick\n\nBrown\tFox ").Should().Be("the quick brown fox");
    }

    [Fact]
    public void ComputeHash_TreatsComposedAndDecomposedUnicodeAsEqual()
    {
        string composed = "café";
        string decomposed = "café";

        StudyGuideTextHash.ComputeHash(decomposed).Should().Be(StudyGuideTextHash.ComputeHash(composed));
        StudyGuideTextHash.Normalize(decomposed).Should().Be(composed);
    }

    [Fact]
    public void ComputeHash_DiffersForDifferentText()
    {
        StudyGuideTextHash.ComputeHash("hello world").Should().NotBe(StudyGuideTextHash.ComputeHash("hello worlds"));
    }
}
