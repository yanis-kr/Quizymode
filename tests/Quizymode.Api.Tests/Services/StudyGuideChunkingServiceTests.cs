using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public class StudyGuideChunkingServiceTests
{
    [Fact]
    public void Chunk_WithTargetChunkCount_ReturnsRequestedNumberOfPromptSetsWhenContentAllows()
    {
        var service = new StudyGuideChunkingService();
        string content = string.Join(
            "\n\n### ",
            Enumerable.Range(1, 8).Select(index =>
                $"{index}\nParagraph one for section {index}. {new string('A', 800)}\n\nParagraph two for section {index}. {new string('B', 600)}"));

        IReadOnlyList<ChunkResult> chunks = service.Chunk(content, "Biology Guide", 4);

        chunks.Should().HaveCount(4);
        chunks.Select(chunk => chunk.Title).Should().Contain(title => title.Contains("Set 1 of 4"));
        chunks.Should().OnlyContain(chunk => !string.IsNullOrWhiteSpace(chunk.ChunkText));
    }

    [Fact]
    public void Chunk_WithTargetChunkCount_OnSmallGuideReturnsAtLeastOneChunk()
    {
        var service = new StudyGuideChunkingService();
        const string content =
            "The cell is the basic unit of life. Mitochondria produce ATP. Ribosomes build proteins.";

        IReadOnlyList<ChunkResult> chunks = service.Chunk(content, "Cells", 6);

        chunks.Should().NotBeEmpty();
        chunks.Count.Should().BeLessThanOrEqualTo(6);
        chunks.Should().OnlyContain(chunk => chunk.SizeBytes > 0);
    }
}
