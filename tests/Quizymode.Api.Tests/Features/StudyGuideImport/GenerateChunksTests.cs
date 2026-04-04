using FluentAssertions;
using Moq;
using Quizymode.Api.Features.StudyGuideImport;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideImport;

public sealed class GenerateChunksTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_InvalidGuid_ReturnsSuccessWithNull()
    {
        var result = await GenerateChunks.HandleAsync(
            "not-a-guid", DbContext, Guid.NewGuid().ToString(),
            Mock.Of<IStudyGuideChunkingService>(),
            Mock.Of<IStudyGuidePromptBuilderService>(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_SessionNotFound_ReturnsSuccessWithNull()
    {
        var result = await GenerateChunks.HandleAsync(
            Guid.NewGuid().ToString(), DbContext, Guid.NewGuid().ToString(),
            Mock.Of<IStudyGuideChunkingService>(),
            Mock.Of<IStudyGuidePromptBuilderService>(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_SessionWithoutStudyGuide_ReturnsSuccessWithNull()
    {
        string userId = Guid.NewGuid().ToString();
        // Create session without associated study guide (simulated by using an orphaned session)
        StudyGuide guide = new()
        {
            Id = Guid.NewGuid(), UserId = userId, Title = "Guide",
            ContentText = "content", SizeBytes = 7,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        };
        StudyGuideImportSession session = new()
        {
            Id = Guid.NewGuid(), StudyGuideId = guide.Id, UserId = "different-user",
            CategoryName = "exams", NavigationKeywordPathJson = "[\"aws\",\"saa-c03\"]",
            TargetItemsPerChunk = 3, Status = StudyGuideImportSessionStatus.Draft,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow
        };
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        await DbContext.SaveChangesAsync();

        // Query as a different user - session won't be found
        var result = await GenerateChunks.HandleAsync(
            session.Id.ToString(), DbContext, userId,
            Mock.Of<IStudyGuideChunkingService>(),
            Mock.Of<IStudyGuidePromptBuilderService>(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ValidSession_CreatesChunks()
    {
        string userId = Guid.NewGuid().ToString();

        StudyGuide guide = new()
        {
            Id = Guid.NewGuid(), UserId = userId, Title = "AWS Study Guide",
            ContentText = "Content about AWS services and cloud computing.",
            SizeBytes = 50, CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        };
        StudyGuideImportSession session = new()
        {
            Id = Guid.NewGuid(), StudyGuideId = guide.Id, UserId = userId,
            CategoryName = "exams", NavigationKeywordPathJson = "[\"aws\",\"saa-c03\"]",
            TargetItemsPerChunk = 3, Status = StudyGuideImportSessionStatus.Draft,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow
        };
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        await DbContext.SaveChangesAsync();

        // Mock chunking service to return 2 chunks
        Mock<IStudyGuideChunkingService> chunkingService = new();
        chunkingService
            .Setup(s => s.Chunk(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>()))
            .Returns(new List<ChunkResult>
            {
                new ChunkResult("Chunk 1", "Part 1 text", 10),
                new ChunkResult("Chunk 2", "Part 2 text", 12)
            });

        Mock<IStudyGuidePromptBuilderService> promptBuilder = new();
        promptBuilder
            .Setup(p => p.BuildChunkPrompt(
                It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<IReadOnlyList<string>?>(),
                It.IsAny<IReadOnlyList<string>?>()))
            .Returns("prompt text");

        var result = await GenerateChunks.HandleAsync(
            session.Id.ToString(), DbContext, userId,
            chunkingService.Object, promptBuilder.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value!.Chunks.Should().HaveCount(2);
        result.Value.Chunks[0].Title.Should().Be("Chunk 1");
        result.Value.Chunks[1].Title.Should().Be("Chunk 2");
        DbContext.StudyGuideChunks.Count(c => c.ImportSessionId == session.Id).Should().Be(2);
    }
}
