using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Ideas;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Ideas;

public sealed class IdeasFeatureTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandlePublicAsync_OnlyReturnsPublishedIdeas()
    {
        string publishedUserId = Guid.NewGuid().ToString();
        string pendingUserId = Guid.NewGuid().ToString();

        DbContext.Ideas.AddRange(
            new Idea
            {
                Id = Guid.NewGuid(),
                Title = "Published idea",
                Problem = "A clear public problem statement",
                ProposedChange = "A clear public proposed change",
                TradeOffs = "Public trade-off",
                Status = IdeaStatus.Planned,
                ModerationState = IdeaModerationState.Published,
                CreatedBy = publishedUserId,
                CreatedAt = DateTime.UtcNow.AddDays(-2)
            },
            new Idea
            {
                Id = Guid.NewGuid(),
                Title = "Pending idea",
                Problem = "This should stay off the public board",
                ProposedChange = "Not yet reviewed",
                Status = IdeaStatus.Proposed,
                ModerationState = IdeaModerationState.PendingReview,
                CreatedBy = pendingUserId,
                CreatedAt = DateTime.UtcNow.AddDays(-1)
            });

        await DbContext.SaveChangesAsync();

        Result<IdeaBoardResponse> result = await IdeaBoard.HandlePublicAsync(
            DbContext,
            AnonymousUser().Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Ideas.Should().ContainSingle();
        result.Value.Ideas[0].Title.Should().Be("Published idea");
        result.Value.Ideas[0].ModerationState.Should().Be("Published");
    }

    [Fact]
    public async Task HandleCreateAsync_CreatesPendingIdeaForAuthenticatedUser()
    {
        string userId = Guid.NewGuid().ToString();
        Mock<ITurnstileVerificationService> turnstileVerificationService = new();
        turnstileVerificationService
            .Setup(service => service.VerifyAsync("dev-turnstile-bypass", It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TurnstileVerificationResult(true));

        Mock<ITextModerationService> textModerationService = new();
        textModerationService
            .Setup(service => service.Evaluate(It.IsAny<string?[]>()))
            .Returns(new TextModerationResult(TextModerationOutcome.Clean));

        Mock<IAuditService> auditService = new();
        DefaultHttpContext httpContext = new();

        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleCreateAsync(
            new IdeaCrud.CreateRequest(
                "Resume study session",
                "Learners need a faster way to continue from where they stopped.",
                "Add a continue action that restores the last study context.",
                "This needs lightweight persistence for recent progress.",
                "dev-turnstile-bypass"),
            DbContext,
            AuthenticatedUser(userId).Object,
            turnstileVerificationService.Object,
            textModerationService.Object,
            auditService.Object,
            new IdeaAbuseProtectionOptions { CreateDailyLimit = 5 },
            httpContext,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be("Proposed");
        result.Value.ModerationState.Should().Be("PendingReview");

        DbContext.Ideas.Should().ContainSingle();
        DbContext.Ideas.Single().CreatedBy.Should().Be(userId);
        DbContext.Ideas.Single().ModerationState.Should().Be(IdeaModerationState.PendingReview);
    }

    [Fact]
    public async Task HandleApproveAsync_PublishesIdeaAndRecordsReviewer()
    {
        string creatorUserId = Guid.NewGuid().ToString();
        string adminUserId = Guid.NewGuid().ToString();
        Idea idea = new()
        {
            Id = Guid.NewGuid(),
            Title = "Pending idea",
            Problem = "A pending moderation item",
            ProposedChange = "A proposal waiting on admin review",
            Status = IdeaStatus.Proposed,
            ModerationState = IdeaModerationState.PendingReview,
            CreatedBy = creatorUserId,
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Mock<IAuditService> auditService = new();

        Result<IdeaSummaryResponse> result = await IdeasAdmin.HandleApproveAsync(
            idea.Id,
            DbContext,
            AuthenticatedUser(adminUserId, isAdmin: true).Object,
            auditService.Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ModerationState.Should().Be("Published");

        Idea updatedIdea = DbContext.Ideas.Single();
        updatedIdea.ModerationState.Should().Be(IdeaModerationState.Published);
        updatedIdea.ReviewedBy.Should().Be(adminUserId);
        updatedIdea.ReviewedAt.Should().NotBeNull();
    }

    private static Mock<IUserContext> AnonymousUser()
    {
        Mock<IUserContext> userContext = new();
        userContext.SetupGet(ctx => ctx.IsAuthenticated).Returns(false);
        userContext.SetupGet(ctx => ctx.UserId).Returns((string?)null);
        userContext.SetupGet(ctx => ctx.IsAdmin).Returns(false);
        return userContext;
    }

    private static Mock<IUserContext> AuthenticatedUser(string userId, bool isAdmin = false)
    {
        Mock<IUserContext> userContext = new();
        userContext.SetupGet(ctx => ctx.IsAuthenticated).Returns(true);
        userContext.SetupGet(ctx => ctx.UserId).Returns(userId);
        userContext.SetupGet(ctx => ctx.IsAdmin).Returns(isAdmin);
        return userContext;
    }
}
