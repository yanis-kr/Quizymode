using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>
/// Session-level exclusion of internal traffic across the admin analytics reports (AC 5.3).
/// </summary>
public sealed class InternalTrafficExclusionTests : DatabaseTestFixture
{
    private const string VisitorSession = "visitor";
    private const string MidSessionSignInSession = "anon-then-admin";
    private const string MarkedBrowserSession = "marked-browser";
    private const string LaterFlaggedUserSession = "later-flagged-user";

    private readonly Guid _laterFlaggedUserId = Guid.NewGuid();
    private readonly Guid _adminUserId = Guid.NewGuid();

    private static IIpGeolocationService NullGeoService()
    {
        Mock<IIpGeolocationService> mock = new();
        mock.Setup(g => g.GetCountryAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        return mock.Object;
    }

    private static PageView Hit(
        string sessionId,
        string path,
        DateTime createdUtc,
        Guid? userId = null,
        bool isInternal = false)
    {
        return new PageView
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            IsAuthenticated = userId.HasValue,
            SessionId = sessionId,
            IpAddress = "198.51.100.10",
            Path = path,
            QueryString = string.Empty,
            Url = path,
            UserAgent = "Mozilla/5.0",
            IsInternal = isInternal,
            CreatedUtc = createdUtc
        };
    }

    private async Task SeedAsync()
    {
        DateTime now = DateTime.UtcNow;

        await DbContext.Users.AddRangeAsync(
            new User { Id = _laterFlaggedUserId, Subject = "subject-later", Email = "later@example.com" },
            new User { Id = _adminUserId, Subject = "subject-admin", Email = "admin@example.com" });

        await DbContext.PageViews.AddRangeAsync(
            // An ordinary anonymous visitor.
            Hit(VisitorSession, "/", now.AddMinutes(-60)),
            Hit(VisitorSession, "/categories", now.AddMinutes(-59)),
            // Starts anonymous (not internal), then signs in as an admin (internal at write time).
            Hit(MidSessionSignInSession, "/", now.AddMinutes(-50)),
            Hit(MidSessionSignInSession, "/collections", now.AddMinutes(-45), _adminUserId, isInternal: true),
            // An anonymous browser carrying the internal marker.
            Hit(MarkedBrowserSession, "/categories/science", now.AddMinutes(-40), isInternal: true),
            // A user who was not internal when these hits were written.
            Hit(LaterFlaggedUserSession, "/", now.AddMinutes(-30), _laterFlaggedUserId),
            Hit(LaterFlaggedUserSession, "/collections", now.AddMinutes(-29), _laterFlaggedUserId));

        await DbContext.SaveChangesAsync();
    }

    private async Task FlagLaterUserInternalAsync()
    {
        User user = await DbContext.Users.FindAsync(_laterFlaggedUserId) ?? throw new InvalidOperationException();
        user.IsInternal = true;
        await DbContext.SaveChangesAsync();
    }

    private Task<Result<GetPageViewSessions.Response>> RunSessions(bool includeInternal = false) =>
        GetPageViewSessions.HandleAsync(
            new GetPageViewSessions.QueryRequest(Days: 7, IncludeInternal: includeInternal),
            DbContext,
            NullGeoService(),
            CancellationToken.None);

    [Fact]
    public async Task Sessions_ExcludeInternalSessionsByDefault_IncludingAnonymousHitsBeforeSignIn()
    {
        await SeedAsync();

        Result<GetPageViewSessions.Response> result = await RunSessions();

        result.IsSuccess.Should().BeTrue();
        GetPageViewSessions.Response response = result.Value!;
        response.Sessions.Select(session => session.SessionId)
            .Should().BeEquivalentTo([VisitorSession, LaterFlaggedUserSession]);
        response.Summary.TotalSessions.Should().Be(2);
        response.Summary.TotalPageHits.Should().Be(4);
        response.Summary.InternalSessions.Should().Be(2);
        response.Summary.InternalExcluded.Should().BeTrue();
        response.LandingPages.Sum(landing => landing.Sessions).Should().Be(2);
    }

    [Fact]
    public async Task Sessions_FlaggingAUserInternal_RetroactivelyExcludesTheirPastSessions()
    {
        await SeedAsync();
        await FlagLaterUserInternalAsync();

        Result<GetPageViewSessions.Response> result = await RunSessions();

        result.IsSuccess.Should().BeTrue();
        result.Value!.Sessions.Select(session => session.SessionId).Should().Equal(VisitorSession);
        result.Value.Summary.InternalSessions.Should().Be(3);

        // The stored hits themselves were not rewritten.
        DbContext.PageViews.Where(pageView => pageView.SessionId == LaterFlaggedUserSession)
            .Should().OnlyContain(pageView => !pageView.IsInternal);
    }

    [Fact]
    public async Task Sessions_IncludeInternal_ReturnsEverySessionAndFlagsInternalOnes()
    {
        await SeedAsync();

        Result<GetPageViewSessions.Response> result = await RunSessions(includeInternal: true);

        result.IsSuccess.Should().BeTrue();
        GetPageViewSessions.Response response = result.Value!;
        response.Summary.TotalSessions.Should().Be(4);
        response.Summary.InternalSessions.Should().Be(2);
        response.Summary.InternalExcluded.Should().BeFalse();
        response.Sessions.Where(session => session.IsInternal).Select(session => session.SessionId)
            .Should().BeEquivalentTo([MidSessionSignInSession, MarkedBrowserSession]);
    }

    [Fact]
    public async Task PageAnalytics_ExcludesEveryHitOfInternalSessions()
    {
        await SeedAsync();

        Result<GetPageViewAnalytics.Response> excluded = await GetPageViewAnalytics.HandleAsync(
            new GetPageViewAnalytics.QueryRequest(Days: 7),
            DbContext,
            NullGeoService(),
            CancellationToken.None);
        Result<GetPageViewAnalytics.Response> included = await GetPageViewAnalytics.HandleAsync(
            new GetPageViewAnalytics.QueryRequest(Days: 7, IncludeInternal: true),
            DbContext,
            NullGeoService(),
            CancellationToken.None);

        excluded.Value!.Summary.TotalPageViews.Should().Be(4);
        excluded.Value.Summary.UniqueSessions.Should().Be(2);
        excluded.Value.Summary.InternalSessions.Should().Be(2);
        excluded.Value.Summary.InternalExcluded.Should().BeTrue();
        excluded.Value.RecentPageViews.Should().NotContain(view => view.SessionId == MidSessionSignInSession);

        included.Value!.Summary.TotalPageViews.Should().Be(7);
        included.Value.Summary.UniqueSessions.Should().Be(4);
        included.Value.Summary.InternalExcluded.Should().BeFalse();
    }

    [Fact]
    public async Task SessionDetail_InternalSessionIsHiddenUnlessIncludeInternal()
    {
        await SeedAsync();

        Result<GetPageViewSessionDetail.Response> hidden = await GetPageViewSessionDetail.HandleAsync(
            new GetPageViewSessionDetail.QueryRequest(MidSessionSignInSession),
            DbContext,
            NullGeoService(),
            CancellationToken.None);
        Result<GetPageViewSessionDetail.Response> shown = await GetPageViewSessionDetail.HandleAsync(
            new GetPageViewSessionDetail.QueryRequest(MidSessionSignInSession, IncludeInternal: true),
            DbContext,
            NullGeoService(),
            CancellationToken.None);
        Result<GetPageViewSessionDetail.Response> ordinary = await GetPageViewSessionDetail.HandleAsync(
            new GetPageViewSessionDetail.QueryRequest(VisitorSession),
            DbContext,
            NullGeoService(),
            CancellationToken.None);

        hidden.IsFailure.Should().BeTrue();
        hidden.Error.Type.Should().Be(ErrorType.NotFound);
        shown.IsSuccess.Should().BeTrue();
        shown.Value!.IsInternal.Should().BeTrue();
        shown.Value.Steps.Should().HaveCount(2);
        ordinary.IsSuccess.Should().BeTrue();
        ordinary.Value!.IsInternal.Should().BeFalse();
    }

    [Fact]
    public async Task SessionDetail_FlaggedUserSessionIsHiddenRetroactively()
    {
        await SeedAsync();
        await FlagLaterUserInternalAsync();

        Result<GetPageViewSessionDetail.Response> result = await GetPageViewSessionDetail.HandleAsync(
            new GetPageViewSessionDetail.QueryRequest(LaterFlaggedUserSession),
            DbContext,
            NullGeoService(),
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task UsersActivity_InternalUserActivityIsExcludedByDefault()
    {
        await SeedAsync();
        await FlagLaterUserInternalAsync();

        Result<AdminUsersActivity.UsersResponse> excluded = await AdminUsersActivity.HandleGetUsersAsync(
            new AdminUsersActivity.UsersQueryRequest(),
            DbContext,
            NullGeoService(),
            CancellationToken.None);
        Result<AdminUsersActivity.UsersResponse> included = await AdminUsersActivity.HandleGetUsersAsync(
            new AdminUsersActivity.UsersQueryRequest(IncludeInternal: true),
            DbContext,
            NullGeoService(),
            CancellationToken.None);

        AdminUsersActivity.UserOverviewResponse flaggedExcluded =
            excluded.Value!.Users.Single(user => user.Id == _laterFlaggedUserId.ToString());
        flaggedExcluded.IsInternal.Should().BeTrue();
        flaggedExcluded.TotalPageViewsInWindow.Should().Be(0);
        flaggedExcluded.LastOpenedUtc.Should().BeNull();
        excluded.Value.Summary.InternalUsers.Should().Be(1);
        excluded.Value.Summary.InternalSessions.Should().Be(2);
        excluded.Value.Summary.InternalExcluded.Should().BeTrue();

        included.Value!.Users.Single(user => user.Id == _laterFlaggedUserId.ToString())
            .TotalPageViewsInWindow.Should().Be(2);
    }

    [Fact]
    public async Task UserPageViewHistory_InternalSessionsAreExcludedByDefault()
    {
        await SeedAsync();
        await FlagLaterUserInternalAsync();

        Result<AdminUsersActivity.UserActivityResponse> excluded = await AdminUsersActivity.HandleGetUserActivityAsync(
            new AdminUsersActivity.UserActivityQueryRequest(_laterFlaggedUserId.ToString()),
            DbContext,
            CancellationToken.None);
        Result<AdminUsersActivity.UserActivityResponse> included = await AdminUsersActivity.HandleGetUserActivityAsync(
            new AdminUsersActivity.UserActivityQueryRequest(_laterFlaggedUserId.ToString(), IncludeInternal: true),
            DbContext,
            CancellationToken.None);

        excluded.Value!.User.IsInternal.Should().BeTrue();
        excluded.Value.Summary.TotalViews.Should().Be(0);
        excluded.Value.Summary.InternalSessions.Should().Be(1);
        excluded.Value.Summary.InternalExcluded.Should().BeTrue();
        included.Value!.Summary.TotalViews.Should().Be(2);
    }
}
