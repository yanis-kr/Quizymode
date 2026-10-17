using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Ideas;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Ideas;

public sealed class IdeasPagingAndCommentModerationTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandlePublicAsync_PagesPublishedIdeasAndReportsTotals()
    {
        string author = Guid.NewGuid().ToString();
        for (int i = 0; i < 5; i++)
        {
            DbContext.Ideas.Add(NewIdea(author, $"Published idea {i}", IdeaModerationState.Published, i));
        }

        DbContext.Ideas.Add(NewIdea(author, "Pending idea", IdeaModerationState.PendingReview, 10));
        await DbContext.SaveChangesAsync();

        Result<IdeaBoardResponse> first = await IdeaBoard.HandlePublicAsync(
            DbContext, Anonymous().Object, CancellationToken.None, page: 1, pageSize: 2);
        Result<IdeaBoardResponse> last = await IdeaBoard.HandlePublicAsync(
            DbContext, Anonymous().Object, CancellationToken.None, page: 3, pageSize: 2);

        first.IsSuccess.Should().BeTrue();
        first.Value.TotalCount.Should().Be(5);
        first.Value.Page.Should().Be(1);
        first.Value.PageSize.Should().Be(2);
        first.Value.Ideas.Should().HaveCount(2);
        last.Value.Ideas.Should().ContainSingle();
        first.Value.Ideas.Select(idea => idea.Id)
            .Should().NotIntersectWith(last.Value.Ideas.Select(idea => idea.Id));
    }

    [Fact]
    public async Task HandlePublicAsync_ClampsInvalidPagingValues()
    {
        DbContext.Ideas.Add(NewIdea(Guid.NewGuid().ToString(), "Only idea", IdeaModerationState.Published, 1));
        await DbContext.SaveChangesAsync();

        Result<IdeaBoardResponse> result = await IdeaBoard.HandlePublicAsync(
            DbContext, Anonymous().Object, CancellationToken.None, page: -4, pageSize: 100000);

        result.IsSuccess.Should().BeTrue();
        result.Value.Page.Should().Be(1);
        result.Value.PageSize.Should().Be(IdeaFeatureSupport.MaxPageSize);
        result.Value.Ideas.Should().ContainSingle();
    }

    [Fact]
    public async Task HandleMineAsync_PagesOnlyTheCallersIdeas()
    {
        string me = Guid.NewGuid().ToString();
        for (int i = 0; i < 3; i++)
        {
            DbContext.Ideas.Add(NewIdea(me, $"My idea {i}", IdeaModerationState.PendingReview, i));
        }

        DbContext.Ideas.Add(NewIdea(Guid.NewGuid().ToString(), "Someone else", IdeaModerationState.Published, 1));
        await DbContext.SaveChangesAsync();

        Result<IdeaBoardResponse> result = await IdeaBoard.HandleMineAsync(
            DbContext, Authenticated(me).Object, CancellationToken.None, page: 2, pageSize: 2);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalCount.Should().Be(3);
        result.Value.Ideas.Should().ContainSingle();
    }

    [Fact]
    public async Task HandleListAsync_PagesAdminQueueWithinModerationFilter()
    {
        string author = Guid.NewGuid().ToString();
        for (int i = 0; i < 4; i++)
        {
            DbContext.Ideas.Add(NewIdea(author, $"Pending {i}", IdeaModerationState.PendingReview, i));
        }

        DbContext.Ideas.Add(NewIdea(author, "Published", IdeaModerationState.Published, 1));
        await DbContext.SaveChangesAsync();

        Result<IdeaBoardResponse> result = await IdeasAdmin.HandleListAsync(
            "PendingReview",
            DbContext,
            Authenticated(Guid.NewGuid().ToString(), isAdmin: true).Object,
            CancellationToken.None,
            page: 2,
            pageSize: 3);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalCount.Should().Be(4);
        result.Value.Ideas.Should().ContainSingle();
    }

    [Fact]
    public async Task HandleDeleteAsync_AdminCanDeleteAnotherUsersComment()
    {
        (Idea idea, IdeaComment comment) = await SeedCommentAsync();

        Result result = await IdeaComments.HandleDeleteAsync(
            idea.Id,
            comment.Id,
            DbContext,
            Authenticated(Guid.NewGuid().ToString(), isAdmin: true).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.IdeaComments.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleDeleteAsync_NonOwnerNonAdminIsForbidden()
    {
        (Idea idea, IdeaComment comment) = await SeedCommentAsync();

        Result result = await IdeaComments.HandleDeleteAsync(
            idea.Id,
            comment.Id,
            DbContext,
            Authenticated(Guid.NewGuid().ToString()).Object,
            new Mock<IAuditService>().Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("IdeaComments.Forbidden");
        DbContext.IdeaComments.Should().ContainSingle();
    }

    [Fact]
    public async Task HandleGetAsync_AdminSeesCanDeleteButNotCanEditOnOthersComments()
    {
        (Idea idea, _) = await SeedCommentAsync();

        Result<IdeaCommentsResponse> admin = await IdeaComments.HandleGetAsync(
            idea.Id,
            DbContext,
            Authenticated(Guid.NewGuid().ToString(), isAdmin: true).Object,
            CancellationToken.None);
        Result<IdeaCommentsResponse> regular = await IdeaComments.HandleGetAsync(
            idea.Id,
            DbContext,
            Authenticated(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        admin.Value.Comments.Should().ContainSingle(comment => comment.CanDelete && !comment.CanEdit);
        regular.Value.Comments.Should().ContainSingle(comment => !comment.CanDelete && !comment.CanEdit);
    }

    private async Task<(Idea Idea, IdeaComment Comment)> SeedCommentAsync()
    {
        Idea idea = NewIdea(Guid.NewGuid().ToString(), "Commented idea", IdeaModerationState.Published, 1);
        IdeaComment comment = new()
        {
            Id = Guid.NewGuid(),
            IdeaId = idea.Id,
            Text = "A comment from some other user.",
            CreatedBy = Guid.NewGuid().ToString(),
            CreatedAt = DateTime.UtcNow.AddHours(-1)
        };

        DbContext.Ideas.Add(idea);
        DbContext.IdeaComments.Add(comment);
        await DbContext.SaveChangesAsync();
        return (idea, comment);
    }

    private static Idea NewIdea(string createdBy, string title, IdeaModerationState state, int ageDays) => new()
    {
        Id = Guid.NewGuid(),
        Title = title,
        Problem = "Learners need a faster way to continue from where they stopped.",
        ProposedChange = "Add a continue action that restores the last study context.",
        Status = IdeaStatus.Proposed,
        ModerationState = state,
        CreatedBy = createdBy,
        CreatedAt = DateTime.UtcNow.AddDays(-ageDays)
    };

    private static Mock<IUserContext> Anonymous()
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
