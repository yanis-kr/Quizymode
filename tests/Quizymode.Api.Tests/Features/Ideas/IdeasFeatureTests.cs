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

    [Fact]
    public async Task HandleListAsync_AllReturnsEveryModerationStateWithAdminPermission()
    {
        Idea pending = NewIdea(Guid.NewGuid().ToString(), "Pending idea", DateTime.UtcNow.AddDays(-1));
        Idea published = NewIdea(Guid.NewGuid().ToString(), "Published idea", DateTime.UtcNow.AddDays(-2));
        published.ModerationState = IdeaModerationState.Published;
        Idea rejected = NewIdea(Guid.NewGuid().ToString(), "Rejected idea", DateTime.UtcNow.AddDays(-3));
        rejected.ModerationState = IdeaModerationState.Rejected;
        DbContext.Ideas.AddRange(pending, published, rejected);
        await DbContext.SaveChangesAsync();

        Result<IdeaBoardResponse> all = await IdeasAdmin.HandleListAsync(
            "all",
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            CancellationToken.None);
        Result<IdeaBoardResponse> pendingOnly = await IdeasAdmin.HandleListAsync(
            "PendingReview",
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            CancellationToken.None);

        all.IsSuccess.Should().BeTrue();
        all.Value.Ideas.Select(idea => idea.ModerationState).Should()
            .BeEquivalentTo(["PendingReview", "Published", "Rejected"]);
        all.Value.Ideas.Should().OnlyContain(idea => idea.CanChangeStatus);
        pendingOnly.Value.Ideas.Should().ContainSingle(idea => idea.Title == "Pending idea");
    }

    [Fact]
    public async Task HandleCreateAsync_RejectsWhenDailyLimitReached()
    {
        string userId = Guid.NewGuid().ToString();
        DbContext.Ideas.AddRange(
            NewIdea(userId, "First recent idea", DateTime.UtcNow.AddHours(-1)),
            NewIdea(userId, "Second recent idea", DateTime.UtcNow.AddHours(-2)),
            NewIdea(userId, "Old idea outside the window", DateTime.UtcNow.AddHours(-30)),
            NewIdea(Guid.NewGuid().ToString(), "Someone else's idea", DateTime.UtcNow.AddHours(-1)));
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> limited = await CreateAsync(userId, "Brand new idea title", dailyLimit: 2);

        limited.IsFailure.Should().BeTrue();
        limited.Error.Code.Should().Be("Ideas.DailyLimitExceeded");

        Result<IdeaSummaryResponse> allowed = await CreateAsync(userId, "Brand new idea title", dailyLimit: 3);

        allowed.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task HandleCreateAsync_RejectsExactDuplicateIgnoringCaseAndWhitespace()
    {
        string userId = Guid.NewGuid().ToString();
        DbContext.Ideas.Add(NewIdea(userId, "Resume study session", DateTime.UtcNow.AddDays(-3)));
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await CreateAsync(userId, "  resume   STUDY session ", dailyLimit: 5);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.Duplicate");
    }

    [Fact]
    public async Task HandleCreateAsync_AllowsSameTitleFromDifferentUserOrDifferentContent()
    {
        string userId = Guid.NewGuid().ToString();
        DbContext.Ideas.Add(NewIdea(Guid.NewGuid().ToString(), "Resume study session", DateTime.UtcNow.AddDays(-3)));
        Idea ownIdea = NewIdea(userId, "Resume study session", DateTime.UtcNow.AddDays(-3));
        ownIdea.Problem = "A completely different problem statement for this idea.";
        DbContext.Ideas.Add(ownIdea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await CreateAsync(userId, "Resume study session", dailyLimit: 5);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task HandleUpdateAsync_DoesNotTreatTheIdeaItselfAsDuplicate()
    {
        string userId = Guid.NewGuid().ToString();
        Idea idea = NewIdea(userId, "Resume study session", DateTime.UtcNow.AddDays(-1));
        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleUpdateAsync(
            idea.Id,
            new IdeaCrud.UpdateRequest(idea.Title, idea.Problem, idea.ProposedChange, "Updated trade-offs text here."),
            DbContext,
            AuthenticatedUser(userId).Object,
            CleanModeration().Object,
            new Mock<IAuditService>().Object,
            new DefaultHttpContext(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TradeOffs.Should().Be("Updated trade-offs text here.");
    }

    [Fact]
    public async Task HandleStatusUpdateAsync_ReturnsValidationErrorForUnknownStatus()
    {
        Idea idea = NewIdea(Guid.NewGuid().ToString(), "Status test idea", DateTime.UtcNow.AddDays(-1));
        idea.Status = IdeaStatus.Planned;
        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleStatusUpdateAsync(
            idea.Id,
            new IdeaCrud.StatusRequest("Exploding"),
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.InvalidStatus");
        result.Error.Type.Should().Be(ErrorType.Validation);
        DbContext.Ideas.Single().Status.Should().Be(IdeaStatus.Planned);
    }

    [Fact]
    public async Task HandleStatusUpdateAsync_AppliesValidStatus()
    {
        Idea idea = NewIdea(Guid.NewGuid().ToString(), "Status test idea", DateTime.UtcNow.AddDays(-1));
        idea.ModerationState = IdeaModerationState.Published;
        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleStatusUpdateAsync(
            idea.Id,
            new IdeaCrud.StatusRequest("In Progress"),
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be("In Progress");
    }

    [Theory]
    [InlineData(IdeaStatus.Proposed, "Shipped")]
    [InlineData(IdeaStatus.Shipped, "Proposed")]
    [InlineData(IdeaStatus.Archived, "Shipped")]
    [InlineData(IdeaStatus.InProgress, "Proposed")]
    public async Task HandleStatusUpdateAsync_RejectsDisallowedTransition(IdeaStatus current, string requested)
    {
        Idea idea = NewIdea(Guid.NewGuid().ToString(), "Status test idea", DateTime.UtcNow.AddDays(-1));
        idea.ModerationState = IdeaModerationState.Published;
        idea.Status = current;
        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleStatusUpdateAsync(
            idea.Id,
            new IdeaCrud.StatusRequest(requested),
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.InvalidStatusTransition");
        result.Error.Type.Should().Be(ErrorType.Conflict);
        DbContext.Ideas.Single().Status.Should().Be(current);
    }

    [Fact]
    public async Task HandleStatusUpdateAsync_RejectsUnpublishedIdea()
    {
        Idea idea = NewIdea(Guid.NewGuid().ToString(), "Status test idea", DateTime.UtcNow.AddDays(-1));
        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleStatusUpdateAsync(
            idea.Id,
            new IdeaCrud.StatusRequest("Planned"),
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.StatusRequiresPublished");
        DbContext.Ideas.Single().Status.Should().Be(IdeaStatus.Proposed);
    }

    [Fact]
    public async Task HandleStatusUpdateAsync_SameStatusIsNoOp()
    {
        Idea idea = NewIdea(Guid.NewGuid().ToString(), "Status test idea", DateTime.UtcNow.AddDays(-1));
        idea.ModerationState = IdeaModerationState.Published;
        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleStatusUpdateAsync(
            idea.Id,
            new IdeaCrud.StatusRequest("Proposed"),
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be("Proposed");
    }

    [Fact]
    public async Task HandleApproveAsync_PreservesExistingNotesWhenNoNoteIsGiven()
    {
        Idea idea = NewIdea(Guid.NewGuid().ToString(), "Rejected idea", DateTime.UtcNow.AddDays(-1));
        idea.ModerationState = IdeaModerationState.Rejected;
        idea.ModerationNotes = "Needs more detail.";
        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await IdeasAdmin.HandleApproveAsync(
            idea.Id,
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.Ideas.Single().ModerationNotes.Should().Be("Needs more detail.");
    }

    [Fact]
    public async Task HandleApproveAsync_StoresOptionalApprovalNote()
    {
        Idea idea = NewIdea(Guid.NewGuid().ToString(), "Pending idea", DateTime.UtcNow.AddDays(-1));
        DbContext.Ideas.Add(idea);
        await DbContext.SaveChangesAsync();

        Result<IdeaSummaryResponse> result = await IdeasAdmin.HandleApproveAsync(
            idea.Id,
            DbContext,
            AuthenticatedUser(Guid.NewGuid().ToString(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None,
            "  Great idea, scheduling soon.  ");

        result.IsSuccess.Should().BeTrue();
        result.Value.ModerationNotes.Should().Be("Great idea, scheduling soon.");
        DbContext.Ideas.Single().ModerationState.Should().Be(IdeaModerationState.Published);
    }

    private async Task<Result<IdeaSummaryResponse>> CreateAsync(string userId, string title, int dailyLimit)
    {
        Mock<ITurnstileVerificationService> turnstileVerificationService = new();
        turnstileVerificationService
            .Setup(service => service.VerifyAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TurnstileVerificationResult(true));

        return await IdeaCrud.HandleCreateAsync(
            new IdeaCrud.CreateRequest(
                title,
                "Learners need a faster way to continue from where they stopped.",
                "Add a continue action that restores the last study context.",
                null,
                "dev-turnstile-bypass"),
            DbContext,
            AuthenticatedUser(userId).Object,
            turnstileVerificationService.Object,
            CleanModeration().Object,
            new Mock<IAuditService>().Object,
            new IdeaAbuseProtectionOptions { CreateDailyLimit = dailyLimit },
            new DefaultHttpContext(),
            CancellationToken.None);
    }

    private static Idea NewIdea(string createdBy, string title, DateTime createdAt) => new()
    {
        Id = Guid.NewGuid(),
        Title = title,
        Problem = "Learners need a faster way to continue from where they stopped.",
        ProposedChange = "Add a continue action that restores the last study context.",
        Status = IdeaStatus.Proposed,
        ModerationState = IdeaModerationState.PendingReview,
        CreatedBy = createdBy,
        CreatedAt = createdAt
    };

    private static Mock<ITextModerationService> CleanModeration()
    {
        Mock<ITextModerationService> textModerationService = new();
        textModerationService
            .Setup(service => service.Evaluate(It.IsAny<string?[]>()))
            .Returns(new TextModerationResult(TextModerationOutcome.Clean));
        return textModerationService;
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
