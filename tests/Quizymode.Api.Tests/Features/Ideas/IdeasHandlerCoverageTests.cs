using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
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

/// <summary>
/// Handler-level coverage for the Ideas feature paths not exercised by <see cref="IdeasFeatureTests"/>:
/// update, delete, status, reject, my ideas, comments, ratings, and create guard rails.
/// </summary>
public sealed class IdeasHandlerCoverageTests : DatabaseTestFixture
{
    // ---------- HandleUpdateAsync ----------

    [Fact]
    public async Task HandleUpdateAsync_OwnerEditOfPublishedIdeaMovesItBackToPendingReview()
    {
        string owner = NewUserId();
        Idea idea = NewIdea(owner, "Published idea", IdeaModerationState.Published);
        idea.ReviewedBy = NewUserId();
        idea.ReviewedAt = DateTime.UtcNow.AddDays(-1);
        await SeedAsync(idea);

        Result<IdeaSummaryResponse> result = await UpdateAsync(idea.Id, owner, "Edited idea title");

        result.IsSuccess.Should().BeTrue();
        Idea stored = DbContext.Ideas.Single();
        stored.Title.Should().Be("Edited idea title");
        stored.ModerationState.Should().Be(IdeaModerationState.PendingReview);
        stored.ModerationNotes.Should().Contain("re-review");
        stored.ReviewedBy.Should().BeNull();
        stored.ReviewedAt.Should().BeNull();
    }

    [Fact]
    public async Task HandleUpdateAsync_OwnerEditOfRejectedIdeaMovesItBackToPendingReview()
    {
        string owner = NewUserId();
        Idea idea = NewIdea(owner, "Rejected idea", IdeaModerationState.Rejected);
        idea.ModerationNotes = "Needs detail";
        await SeedAsync(idea);

        Result<IdeaSummaryResponse> result = await UpdateAsync(idea.Id, owner, "Reworked idea title");

        result.IsSuccess.Should().BeTrue();
        DbContext.Ideas.Single().ModerationState.Should().Be(IdeaModerationState.PendingReview);
    }

    [Fact]
    public async Task HandleUpdateAsync_AdminEditKeepsModerationState()
    {
        Idea idea = NewIdea(NewUserId(), "Published idea", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result<IdeaSummaryResponse> result = await UpdateAsync(idea.Id, NewUserId(), "Admin tweaked title", isAdmin: true);

        result.IsSuccess.Should().BeTrue();
        DbContext.Ideas.Single().ModerationState.Should().Be(IdeaModerationState.Published);
    }

    [Fact]
    public async Task HandleUpdateAsync_NonOwnerIsForbidden()
    {
        Idea idea = NewIdea(NewUserId(), "Someone else's idea", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result<IdeaSummaryResponse> result = await UpdateAsync(idea.Id, NewUserId(), "Hijacked title");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.Forbidden");
        DbContext.Ideas.Single().Title.Should().Be("Someone else's idea");
    }

    [Fact]
    public async Task HandleUpdateAsync_UnknownIdeaIsNotFound()
    {
        Result<IdeaSummaryResponse> result = await UpdateAsync(Guid.NewGuid(), NewUserId(), "Anything at all");

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleUpdateAsync_RejectsDuplicateOfAnotherOwnIdea()
    {
        string owner = NewUserId();
        Idea first = NewIdea(owner, "First idea title", IdeaModerationState.PendingReview);
        Idea second = NewIdea(owner, "Second idea title", IdeaModerationState.PendingReview);
        await SeedAsync(first, second);

        Result<IdeaSummaryResponse> result = await UpdateAsync(second.Id, owner, "First idea title");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.Duplicate");
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }

    [Fact]
    public async Task HandleUpdateAsync_RejectsBlockedLanguage()
    {
        string owner = NewUserId();
        Idea idea = NewIdea(owner, "Original title", IdeaModerationState.PendingReview);
        await SeedAsync(idea);

        Result<IdeaSummaryResponse> result = await UpdateAsync(
            idea.Id, owner, "Blocked title text", moderation: ModerationReturning(TextModerationOutcome.Blocked));

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.ProfanityBlocked");
        DbContext.Ideas.Single().Title.Should().Be("Original title");
    }

    [Fact]
    public async Task HandleUpdateAsync_RejectsTooShortTitle()
    {
        string owner = NewUserId();
        Idea idea = NewIdea(owner, "Original title", IdeaModerationState.PendingReview);
        await SeedAsync(idea);

        Result<IdeaSummaryResponse> result = await UpdateAsync(idea.Id, owner, "--");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.TitleTooShort");
    }

    // ---------- HandleDeleteAsync ----------

    [Fact]
    public async Task HandleDeleteAsync_NonOwnerIsForbiddenAndIdeaSurvives()
    {
        Idea idea = NewIdea(NewUserId(), "Keep me", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result result = await IdeaCrud.HandleDeleteAsync(
            idea.Id, DbContext, Authenticated(NewUserId()).Object, new Mock<IAuditService>().Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.Forbidden");
        DbContext.Ideas.Should().ContainSingle();
    }

    [Fact]
    public async Task HandleDeleteAsync_OwnerDeleteCascadesCommentsAndRatings()
    {
        string owner = NewUserId();
        Idea idea = NewIdea(owner, "Delete me", IdeaModerationState.Published);
        Idea otherIdea = NewIdea(NewUserId(), "Unrelated idea", IdeaModerationState.Published);
        await SeedAsync(idea, otherIdea);
        DbContext.IdeaComments.AddRange(NewComment(idea.Id, NewUserId()), NewComment(otherIdea.Id, NewUserId()));
        DbContext.IdeaRatings.AddRange(
            new IdeaRating { Id = Guid.NewGuid(), IdeaId = idea.Id, Stars = 4, CreatedBy = NewUserId() },
            new IdeaRating { Id = Guid.NewGuid(), IdeaId = otherIdea.Id, Stars = 2, CreatedBy = NewUserId() });
        await DbContext.SaveChangesAsync();

        Result result = await IdeaCrud.HandleDeleteAsync(
            idea.Id, DbContext, Authenticated(owner).Object, new Mock<IAuditService>().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.ChangeTracker.Clear();
        (await DbContext.Ideas.ToListAsync()).Should().ContainSingle(i => i.Id == otherIdea.Id);
        (await DbContext.IdeaComments.ToListAsync()).Should().ContainSingle(c => c.IdeaId == otherIdea.Id);
        (await DbContext.IdeaRatings.ToListAsync()).Should().ContainSingle(r => r.IdeaId == otherIdea.Id);
    }

    [Fact]
    public async Task HandleDeleteAsync_AdminCanDeleteAnyIdea()
    {
        Idea idea = NewIdea(NewUserId(), "Admin removes", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result result = await IdeaCrud.HandleDeleteAsync(
            idea.Id, DbContext, Authenticated(NewUserId(), isAdmin: true).Object, new Mock<IAuditService>().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.Ideas.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleDeleteAsync_UnknownIdeaIsNotFound()
    {
        Result result = await IdeaCrud.HandleDeleteAsync(
            Guid.NewGuid(), DbContext, Authenticated(NewUserId()).Object, new Mock<IAuditService>().Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    // ---------- HandleStatusUpdateAsync ----------

    [Fact]
    public async Task HandleStatusUpdateAsync_UpdatesPublishedIdeaAndAudits()
    {
        Idea idea = NewIdea(NewUserId(), "Roadmap idea", IdeaModerationState.Published);
        await SeedAsync(idea);
        Mock<IAuditService> audit = new();

        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleStatusUpdateAsync(
            idea.Id,
            new IdeaCrud.StatusRequest("Planned"),
            DbContext,
            Authenticated(NewUserId(), isAdmin: true).Object,
            audit.Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be("Planned");
        DbContext.Ideas.Single().Status.Should().Be(IdeaStatus.Planned);
        audit.Verify(
            service => service.LogAsync(
                AuditAction.IdeaStatusChanged, It.IsAny<Guid?>(), idea.Id, It.IsAny<Dictionary<string, string>?>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleStatusUpdateAsync_UnknownIdeaIsNotFound()
    {
        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleStatusUpdateAsync(
            Guid.NewGuid(),
            new IdeaCrud.StatusRequest("Planned"),
            DbContext,
            Authenticated(NewUserId(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    // ---------- HandleRejectAsync ----------

    [Fact]
    public async Task HandleRejectAsync_RejectsIdeaWithNormalizedNotesAndReviewer()
    {
        string admin = NewUserId();
        Idea idea = NewIdea(NewUserId(), "Pending idea", IdeaModerationState.PendingReview);
        await SeedAsync(idea);

        Result<IdeaSummaryResponse> result = await IdeasAdmin.HandleRejectAsync(
            idea.Id,
            new IdeasAdmin.RejectRequest("  Needs   more   detail  "),
            DbContext,
            Authenticated(admin, isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ModerationState.Should().Be("Rejected");
        Idea stored = DbContext.Ideas.Single();
        stored.ModerationState.Should().Be(IdeaModerationState.Rejected);
        stored.ModerationNotes.Should().Be("Needs more detail");
        stored.ReviewedBy.Should().Be(admin);
        stored.ReviewedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task HandleRejectAsync_UnknownIdeaIsNotFound()
    {
        Result<IdeaSummaryResponse> result = await IdeasAdmin.HandleRejectAsync(
            Guid.NewGuid(),
            new IdeasAdmin.RejectRequest("No such idea"),
            DbContext,
            Authenticated(NewUserId(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public void RejectValidator_RequiresANote()
    {
        IdeasAdmin.RejectValidator validator = new();

        validator.Validate(new IdeasAdmin.RejectRequest("")).IsValid.Should().BeFalse();
        validator.Validate(new IdeasAdmin.RejectRequest(new string('x', 1001))).IsValid.Should().BeFalse();
        validator.Validate(new IdeasAdmin.RejectRequest("Too vague")).IsValid.Should().BeTrue();
    }

    // ---------- HandleMineAsync ----------

    [Fact]
    public async Task HandleMineAsync_ReturnsOnlyCallersIdeasAcrossModerationStates()
    {
        string me = NewUserId();
        await SeedAsync(
            NewIdea(me, "My pending", IdeaModerationState.PendingReview),
            NewIdea(me, "My published", IdeaModerationState.Published),
            NewIdea(me, "My rejected", IdeaModerationState.Rejected),
            NewIdea(NewUserId(), "Not mine", IdeaModerationState.Published));

        Result<IdeaBoardResponse> result = await IdeaBoard.HandleMineAsync(
            DbContext, Authenticated(me).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Ideas.Select(i => i.Title).Should()
            .BeEquivalentTo("My pending", "My published", "My rejected");
        result.Value.Ideas.Should().OnlyContain(i => i.CanEdit && i.CanDelete && !i.CanChangeStatus);
    }

    // ---------- HandleCreateAsync guard rails ----------

    [Fact]
    public async Task HandleCreateAsync_RejectsBlockedLanguageAndCreatesNothing()
    {
        Result<IdeaSummaryResponse> result = await CreateAsync(
            NewUserId(), moderation: ModerationReturning(TextModerationOutcome.Blocked));

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.ProfanityBlocked");
        DbContext.Ideas.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleCreateAsync_FlagsSuspiciousTextForReview()
    {
        Result<IdeaSummaryResponse> result = await CreateAsync(
            NewUserId(), moderation: ModerationReturning(TextModerationOutcome.Suspicious));

        result.IsSuccess.Should().BeTrue();
        result.Value.ModerationState.Should().Be("PendingReview");
        DbContext.Ideas.Single().ModerationNotes.Should().Contain("Flagged");
    }

    [Fact]
    public async Task HandleCreateAsync_ReturnsTurnstileFailureAndCreatesNothing()
    {
        Mock<ITurnstileVerificationService> turnstile = new();
        turnstile
            .Setup(service => service.VerifyAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TurnstileVerificationResult(false, "invalid-input-response", "Challenge failed."));

        Result<IdeaSummaryResponse> result = await CreateAsync(NewUserId(), turnstile: turnstile);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.TurnstileFailed");
        result.Error.Description.Should().Be("Challenge failed.");
        DbContext.Ideas.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleCreateAsync_RequiresUserId()
    {
        Result<IdeaSummaryResponse> result = await CreateAsync(string.Empty);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.UserIdMissing");
    }

    [Fact]
    public async Task HandleCreateAsync_RejectsTooShortFields()
    {
        Result<IdeaSummaryResponse> result = await IdeaCrud.HandleCreateAsync(
            new IdeaCrud.CreateRequest("Valid title", "short", "Add a continue action for study.", null, "token"),
            DbContext,
            Authenticated(NewUserId()).Object,
            VerifiedTurnstile().Object,
            ModerationReturning(TextModerationOutcome.Clean).Object,
            new Mock<IAuditService>().Object,
            new IdeaAbuseProtectionOptions { CreateDailyLimit = 5 },
            new DefaultHttpContext(),
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ideas.ProblemTooShort");
    }

    // ---------- IdeaComments ----------

    [Fact]
    public async Task CommentCreate_OnPublishedIdeaStoresNormalizedTextForCaller()
    {
        string commenter = NewUserId();
        Idea idea = NewIdea(NewUserId(), "Discussed idea", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result<IdeaCommentResponse> result = await CreateCommentAsync(idea.Id, commenter, "  Looks   great to me  ");

        result.IsSuccess.Should().BeTrue();
        result.Value.Text.Should().Be("Looks great to me");
        result.Value.CanEdit.Should().BeTrue();
        result.Value.CanDelete.Should().BeTrue();
        DbContext.IdeaComments.Single().CreatedBy.Should().Be(commenter);
    }

    [Theory]
    [InlineData(IdeaModerationState.PendingReview)]
    [InlineData(IdeaModerationState.Rejected)]
    public async Task CommentCreate_OnUnpublishedIdeaIsNotFound(IdeaModerationState state)
    {
        Idea idea = NewIdea(NewUserId(), "Hidden idea", state);
        await SeedAsync(idea);

        Result<IdeaCommentResponse> result = await CreateCommentAsync(idea.Id, NewUserId(), "A valid comment");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("IdeaComments.IdeaNotFound");
        DbContext.IdeaComments.Should().BeEmpty();
    }

    [Fact]
    public async Task CommentCreate_RejectsTooShortAndBlockedText()
    {
        Idea idea = NewIdea(NewUserId(), "Discussed idea", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result<IdeaCommentResponse> tooShort = await CreateCommentAsync(idea.Id, NewUserId(), "!!");
        Result<IdeaCommentResponse> blocked = await CreateCommentAsync(
            idea.Id, NewUserId(), "Some rude words", ModerationReturning(TextModerationOutcome.Blocked));

        tooShort.Error.Code.Should().Be("IdeaComments.TextTooShort");
        blocked.Error.Code.Should().Be("IdeaComments.ProfanityBlocked");
        DbContext.IdeaComments.Should().BeEmpty();
    }

    [Fact]
    public async Task CommentCreate_RequiresUserId()
    {
        Idea idea = NewIdea(NewUserId(), "Discussed idea", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result<IdeaCommentResponse> result = await CreateCommentAsync(idea.Id, string.Empty, "A valid comment");

        result.Error.Code.Should().Be("IdeaComments.UserIdMissing");
    }

    [Fact]
    public async Task CommentGet_ReturnsCommentsOnlyForPublishedIdeas()
    {
        Idea published = NewIdea(NewUserId(), "Published", IdeaModerationState.Published);
        Idea pending = NewIdea(NewUserId(), "Pending", IdeaModerationState.PendingReview);
        await SeedAsync(published, pending);
        DbContext.IdeaComments.AddRange(NewComment(published.Id, NewUserId()), NewComment(pending.Id, NewUserId()));
        await DbContext.SaveChangesAsync();

        Result<IdeaCommentsResponse> ok = await IdeaComments.HandleGetAsync(
            published.Id, DbContext, AnonymousUser().Object, CancellationToken.None);
        Result<IdeaCommentsResponse> hidden = await IdeaComments.HandleGetAsync(
            pending.Id, DbContext, AnonymousUser().Object, CancellationToken.None);

        ok.IsSuccess.Should().BeTrue();
        ok.Value.Comments.Should().ContainSingle().Which.CanEdit.Should().BeFalse();
        hidden.IsFailure.Should().BeTrue();
        hidden.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task CommentUpdate_OwnerCanEditAndNonOwnerCannot()
    {
        string owner = NewUserId();
        Idea idea = NewIdea(NewUserId(), "Discussed idea", IdeaModerationState.Published);
        IdeaComment comment = NewComment(idea.Id, owner);
        await SeedAsync(idea);
        DbContext.IdeaComments.Add(comment);
        await DbContext.SaveChangesAsync();

        Result<IdeaCommentResponse> forbidden = await UpdateCommentAsync(idea.Id, comment.Id, NewUserId(), "Overwritten text");
        Result<IdeaCommentResponse> ok = await UpdateCommentAsync(idea.Id, comment.Id, owner, "Edited by the owner");

        forbidden.Error.Code.Should().Be("IdeaComments.Forbidden");
        ok.IsSuccess.Should().BeTrue();
        ok.Value.Text.Should().Be("Edited by the owner");
        ok.Value.UpdatedAt.Should().NotBeNull();
        DbContext.IdeaComments.Single().Text.Should().Be("Edited by the owner");
    }

    [Fact]
    public async Task CommentUpdate_RejectsBlockedTextAndMissingComment()
    {
        string owner = NewUserId();
        Idea idea = NewIdea(NewUserId(), "Discussed idea", IdeaModerationState.Published);
        IdeaComment comment = NewComment(idea.Id, owner);
        await SeedAsync(idea);
        DbContext.IdeaComments.Add(comment);
        await DbContext.SaveChangesAsync();

        Result<IdeaCommentResponse> blocked = await UpdateCommentAsync(
            idea.Id, comment.Id, owner, "Rude words here", ModerationReturning(TextModerationOutcome.Blocked));
        Result<IdeaCommentResponse> missing = await UpdateCommentAsync(idea.Id, Guid.NewGuid(), owner, "Valid replacement");

        blocked.Error.Code.Should().Be("IdeaComments.ProfanityBlocked");
        missing.Error.Type.Should().Be(ErrorType.NotFound);
        DbContext.IdeaComments.Single().Text.Should().NotContain("Rude");
    }

    [Fact]
    public async Task CommentDelete_OwnerCanDeleteAndMissingCommentIsNotFound()
    {
        string owner = NewUserId();
        Idea idea = NewIdea(NewUserId(), "Discussed idea", IdeaModerationState.Published);
        IdeaComment comment = NewComment(idea.Id, owner);
        await SeedAsync(idea);
        DbContext.IdeaComments.Add(comment);
        await DbContext.SaveChangesAsync();

        Result missing = await IdeaComments.HandleDeleteAsync(
            idea.Id, Guid.NewGuid(), DbContext, Authenticated(owner).Object, new Mock<IAuditService>().Object, CancellationToken.None);
        Result ok = await IdeaComments.HandleDeleteAsync(
            idea.Id, comment.Id, DbContext, Authenticated(owner).Object, new Mock<IAuditService>().Object, CancellationToken.None);

        missing.Error.Type.Should().Be(ErrorType.NotFound);
        ok.IsSuccess.Should().BeTrue();
        DbContext.IdeaComments.Should().BeEmpty();
    }

    // ---------- IdeaRatings ----------

    [Fact]
    public async Task RatingUpsert_CreatesThenUpdatesExactlyOneRowPerUser()
    {
        string rater = NewUserId();
        Idea idea = NewIdea(NewUserId(), "Rated idea", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result<IdeaRatings.Response> first = await IdeaRatings.HandleAsync(
            idea.Id, new IdeaRatings.Request(3), DbContext, Authenticated(rater).Object, CancellationToken.None);
        Result<IdeaRatings.Response> second = await IdeaRatings.HandleAsync(
            idea.Id, new IdeaRatings.Request(5), DbContext, Authenticated(rater).Object, CancellationToken.None);

        first.IsSuccess.Should().BeTrue();
        first.Value.Stars.Should().Be(3);
        first.Value.UpdatedAt.Should().BeNull();
        second.Value.Stars.Should().Be(5);
        second.Value.Id.Should().Be(first.Value.Id);
        second.Value.UpdatedAt.Should().NotBeNull();
        DbContext.IdeaRatings.Should().ContainSingle().Which.Stars.Should().Be(5);
    }

    [Fact]
    public async Task RatingUpsert_NullStarsClearsTheRatingValueButKeepsTheRow()
    {
        string rater = NewUserId();
        Idea idea = NewIdea(NewUserId(), "Rated idea", IdeaModerationState.Published);
        await SeedAsync(idea);
        await IdeaRatings.HandleAsync(
            idea.Id, new IdeaRatings.Request(4), DbContext, Authenticated(rater).Object, CancellationToken.None);

        Result<IdeaRatings.Response> cleared = await IdeaRatings.HandleAsync(
            idea.Id, new IdeaRatings.Request(null), DbContext, Authenticated(rater).Object, CancellationToken.None);

        cleared.IsSuccess.Should().BeTrue();
        cleared.Value.Stars.Should().BeNull();
        DbContext.IdeaRatings.Should().ContainSingle().Which.Stars.Should().BeNull();
    }

    [Fact]
    public async Task RatingUpsert_TwoUsersGetSeparateRows()
    {
        Idea idea = NewIdea(NewUserId(), "Rated idea", IdeaModerationState.Published);
        await SeedAsync(idea);

        await IdeaRatings.HandleAsync(idea.Id, new IdeaRatings.Request(1), DbContext, Authenticated(NewUserId()).Object, CancellationToken.None);
        await IdeaRatings.HandleAsync(idea.Id, new IdeaRatings.Request(5), DbContext, Authenticated(NewUserId()).Object, CancellationToken.None);

        DbContext.IdeaRatings.Should().HaveCount(2);
    }

    [Theory]
    [InlineData(IdeaModerationState.PendingReview)]
    [InlineData(IdeaModerationState.Rejected)]
    public async Task RatingUpsert_UnpublishedIdeaIsNotFound(IdeaModerationState state)
    {
        Idea idea = NewIdea(NewUserId(), "Hidden idea", state);
        await SeedAsync(idea);

        Result<IdeaRatings.Response> result = await IdeaRatings.HandleAsync(
            idea.Id, new IdeaRatings.Request(4), DbContext, Authenticated(NewUserId()).Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("IdeaRatings.IdeaNotFound");
        DbContext.IdeaRatings.Should().BeEmpty();
    }

    [Fact]
    public async Task RatingUpsert_RequiresUserId()
    {
        Idea idea = NewIdea(NewUserId(), "Rated idea", IdeaModerationState.Published);
        await SeedAsync(idea);

        Result<IdeaRatings.Response> result = await IdeaRatings.HandleAsync(
            idea.Id, new IdeaRatings.Request(4), DbContext, Authenticated(string.Empty).Object, CancellationToken.None);

        result.Error.Code.Should().Be("IdeaRatings.UserIdMissing");
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(5, true)]
    [InlineData(6, false)]
    [InlineData(null, true)]
    public void RatingValidator_EnforcesStarRange(int? stars, bool expectedValid)
    {
        new IdeaRatings.Validator().Validate(new IdeaRatings.Request(stars)).IsValid.Should().Be(expectedValid);
    }

    // ---------- helpers ----------

    private async Task SeedAsync(params Idea[] ideas)
    {
        DbContext.Ideas.AddRange(ideas);
        await DbContext.SaveChangesAsync();
    }

    private Task<Result<IdeaSummaryResponse>> UpdateAsync(
        Guid id,
        string userId,
        string title,
        bool isAdmin = false,
        Mock<ITextModerationService>? moderation = null) =>
        IdeaCrud.HandleUpdateAsync(
            id,
            new IdeaCrud.UpdateRequest(
                title,
                "Learners need a faster way to continue from where they stopped.",
                "Add a continue action that restores the last study context.",
                null),
            DbContext,
            Authenticated(userId, isAdmin).Object,
            (moderation ?? ModerationReturning(TextModerationOutcome.Clean)).Object,
            new Mock<IAuditService>().Object,
            new DefaultHttpContext(),
            CancellationToken.None);

    private Task<Result<IdeaSummaryResponse>> CreateAsync(
        string userId,
        Mock<ITextModerationService>? moderation = null,
        Mock<ITurnstileVerificationService>? turnstile = null) =>
        IdeaCrud.HandleCreateAsync(
            new IdeaCrud.CreateRequest(
                "Resume study session",
                "Learners need a faster way to continue from where they stopped.",
                "Add a continue action that restores the last study context.",
                null,
                "token"),
            DbContext,
            Authenticated(userId).Object,
            (turnstile ?? VerifiedTurnstile()).Object,
            (moderation ?? ModerationReturning(TextModerationOutcome.Clean)).Object,
            new Mock<IAuditService>().Object,
            new IdeaAbuseProtectionOptions { CreateDailyLimit = 5 },
            new DefaultHttpContext(),
            CancellationToken.None);

    private Task<Result<IdeaCommentResponse>> CreateCommentAsync(
        Guid ideaId,
        string userId,
        string text,
        Mock<ITextModerationService>? moderation = null) =>
        IdeaComments.HandleCreateAsync(
            ideaId,
            new IdeaComments.CreateRequest(text),
            DbContext,
            Authenticated(userId).Object,
            (moderation ?? ModerationReturning(TextModerationOutcome.Clean)).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

    private Task<Result<IdeaCommentResponse>> UpdateCommentAsync(
        Guid ideaId,
        Guid commentId,
        string userId,
        string text,
        Mock<ITextModerationService>? moderation = null) =>
        IdeaComments.HandleUpdateAsync(
            ideaId,
            commentId,
            new IdeaComments.UpdateRequest(text),
            DbContext,
            Authenticated(userId).Object,
            (moderation ?? ModerationReturning(TextModerationOutcome.Clean)).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

    private static string NewUserId() => Guid.NewGuid().ToString();

    private static Idea NewIdea(string createdBy, string title, IdeaModerationState state) => new()
    {
        Id = Guid.NewGuid(),
        Title = title,
        Problem = "Learners need a faster way to continue from where they stopped.",
        ProposedChange = "Add a continue action that restores the last study context.",
        Status = IdeaStatus.Proposed,
        ModerationState = state,
        CreatedBy = createdBy,
        CreatedAt = DateTime.UtcNow.AddDays(-1)
    };

    private static IdeaComment NewComment(Guid ideaId, string createdBy) => new()
    {
        Id = Guid.NewGuid(),
        IdeaId = ideaId,
        Text = "A comment worth reading.",
        CreatedBy = createdBy,
        CreatedAt = DateTime.UtcNow.AddHours(-1)
    };

    private static Mock<ITextModerationService> ModerationReturning(TextModerationOutcome outcome)
    {
        Mock<ITextModerationService> moderation = new();
        moderation
            .Setup(service => service.Evaluate(It.IsAny<string?[]>()))
            .Returns(new TextModerationResult(outcome, outcome == TextModerationOutcome.Clean ? null : "term"));
        return moderation;
    }

    private static Mock<ITurnstileVerificationService> VerifiedTurnstile()
    {
        Mock<ITurnstileVerificationService> turnstile = new();
        turnstile
            .Setup(service => service.VerifyAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TurnstileVerificationResult(true));
        return turnstile;
    }

    private static Mock<IUserContext> AnonymousUser()
    {
        Mock<IUserContext> userContext = new();
        userContext.SetupGet(ctx => ctx.IsAuthenticated).Returns(false);
        userContext.SetupGet(ctx => ctx.UserId).Returns((string?)null);
        userContext.SetupGet(ctx => ctx.IsAdmin).Returns(false);
        return userContext;
    }

    private static Mock<IUserContext> Authenticated(string userId, bool isAdmin = false)
    {
        Mock<IUserContext> userContext = new();
        userContext.SetupGet(ctx => ctx.IsAuthenticated).Returns(true);
        userContext.SetupGet(ctx => ctx.UserId).Returns(userId);
        userContext.SetupGet(ctx => ctx.IsAdmin).Returns(isAdmin);
        return userContext;
    }
}
