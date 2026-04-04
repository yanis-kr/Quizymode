using FluentAssertions;
using Moq;
using Quizymode.Api.Features.StudyGuideImport;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideImport;

public sealed class FinalizeImportTests : DatabaseTestFixture
{
    private static (Mock<IUserContext> ctx, string userId) CreateUserContext()
    {
        string userId = Guid.NewGuid().ToString();
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns(userId);
        ctx.Setup(x => x.IsAuthenticated).Returns(true);
        ctx.Setup(x => x.IsAdmin).Returns(false);
        return (ctx, userId);
    }

    [Fact]
    public async Task HandleAsync_InvalidGuid_ReturnsSuccessWithNull()
    {
        var (ctx, _) = CreateUserContext();

        var result = await FinalizeImport.HandleAsync(
            "not-a-guid", DbContext, ctx.Object,
            Mock.Of<ISimHashService>(),
            Mock.Of<ITaxonomyItemCategoryResolver>(),
            Mock.Of<ITaxonomyRegistry>(),
            Mock.Of<IAuditService>(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_SessionNotFound_ReturnsSuccessWithNull()
    {
        var (ctx, _) = CreateUserContext();

        var result = await FinalizeImport.HandleAsync(
            Guid.NewGuid().ToString(), DbContext, ctx.Object,
            Mock.Of<ISimHashService>(),
            Mock.Of<ITaxonomyItemCategoryResolver>(),
            Mock.Of<ITaxonomyRegistry>(),
            Mock.Of<IAuditService>(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_SessionBelongsToOtherUser_ReturnsSuccessWithNull()
    {
        string otherId = Guid.NewGuid().ToString();
        var (ctx, myId) = CreateUserContext();

        StudyGuide guide = new()
        {
            Id = Guid.NewGuid(), UserId = otherId, Title = "Guide",
            ContentText = "content", SizeBytes = 7,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        };
        StudyGuideImportSession session = new()
        {
            Id = Guid.NewGuid(), StudyGuideId = guide.Id, UserId = otherId,
            CategoryName = "exams", NavigationKeywordPathJson = "[\"aws\",\"saa-c03\"]",
            TargetItemsPerChunk = 3, Status = StudyGuideImportSessionStatus.InProgress,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow
        };
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        await DbContext.SaveChangesAsync();

        var result = await FinalizeImport.HandleAsync(
            session.Id.ToString(), DbContext, ctx.Object,
            Mock.Of<ISimHashService>(),
            Mock.Of<ITaxonomyItemCategoryResolver>(),
            Mock.Of<ITaxonomyRegistry>(),
            Mock.Of<IAuditService>(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_NavPathLessThanTwo_ReturnsValidationFailure()
    {
        var (ctx, userId) = CreateUserContext();

        StudyGuide guide = new()
        {
            Id = Guid.NewGuid(), UserId = userId, Title = "Guide",
            ContentText = "content", SizeBytes = 7,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        };
        StudyGuideImportSession session = new()
        {
            Id = Guid.NewGuid(), StudyGuideId = guide.Id, UserId = userId,
            CategoryName = "exams", NavigationKeywordPathJson = "[\"aws\"]",  // only one keyword
            TargetItemsPerChunk = 3, Status = StudyGuideImportSessionStatus.InProgress,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow
        };
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        await DbContext.SaveChangesAsync();

        var result = await FinalizeImport.HandleAsync(
            session.Id.ToString(), DbContext, ctx.Object,
            Mock.Of<ISimHashService>(),
            Mock.Of<ITaxonomyItemCategoryResolver>(),
            Mock.Of<ITaxonomyRegistry>(),
            Mock.Of<IAuditService>(),
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Import.InvalidNavigation");
    }
}
