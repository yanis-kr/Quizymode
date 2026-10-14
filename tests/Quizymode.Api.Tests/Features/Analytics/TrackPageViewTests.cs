using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Analytics;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Analytics;

public sealed class TrackPageViewTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock = new();

    [Fact]
    public async Task HandleAsync_StoresAnonymousPageView()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);
        DefaultHttpContext httpContext = CreateHttpContext("198.51.100.24");

        TrackPageView.Request request = new("/categories/science", "?sort=popular", "session-anon-1");

        var result = await TrackPageView.HandleAsync(request, httpContext, DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        PageView? pageView = await DbContext.PageViews.SingleOrDefaultAsync();
        pageView.Should().NotBeNull();
        pageView!.IsAuthenticated.Should().BeFalse();
        pageView.UserId.Should().BeNull();
        pageView.Path.Should().Be("/categories/science");
        pageView.QueryString.Should().Be("?sort=popular");
        pageView.Url.Should().Be("/categories/science?sort=popular");
        pageView.SessionId.Should().Be("session-anon-1");
        pageView.IpAddress.Should().Be("198.51.100.24");
    }

    [Fact]
    public async Task HandleAsync_StoresAuthenticatedPageView()
    {
        Guid userId = Guid.NewGuid();
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(true);
        _userContextMock.SetupGet(context => context.UserId).Returns(userId.ToString());
        DefaultHttpContext httpContext = CreateHttpContext("203.0.113.8");

        TrackPageView.Request request = new("/admin", string.Empty, "session-auth-1");

        var result = await TrackPageView.HandleAsync(request, httpContext, DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        PageView? pageView = await DbContext.PageViews.SingleOrDefaultAsync();
        pageView.Should().NotBeNull();
        pageView!.IsAuthenticated.Should().BeTrue();
        pageView.UserId.Should().Be(userId);
        pageView.QueryString.Should().BeEmpty();
        pageView.Url.Should().Be("/admin");
    }

    [Theory]
    [InlineData("")]
    [InlineData("categories")]
    [InlineData(" ")]
    public async Task HandleAsync_InvalidPath_ReturnsValidationError(string path)
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);
        DefaultHttpContext httpContext = CreateHttpContext("203.0.113.99");

        TrackPageView.Request request = new(path, string.Empty, "session-1");

        var result = await TrackPageView.HandleAsync(request, httpContext, DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        (await DbContext.PageViews.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_NormalizesQueryStringWithoutLeadingQuestionMark()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);
        DefaultHttpContext httpContext = CreateHttpContext("192.0.2.50");

        TrackPageView.Request request = new("/collections", "page=2", "session-2");

        var result = await TrackPageView.HandleAsync(request, httpContext, DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        PageView? pageView = await DbContext.PageViews.SingleOrDefaultAsync();
        pageView.Should().NotBeNull();
        pageView!.QueryString.Should().Be("?page=2");
        pageView.Url.Should().Be("/collections?page=2");
    }

    [Fact]
    public async Task HandleAsync_StoresUserAgentAndFlagsHumanTraffic()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);

        const string browserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        DefaultHttpContext httpContext = CreateHttpContext("198.51.100.24", browserAgent);

        TrackPageView.Request request = new("/categories", string.Empty, "session-human-1");

        var result = await TrackPageView.HandleAsync(request, httpContext, DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        PageView? pageView = await DbContext.PageViews.SingleOrDefaultAsync();
        pageView!.UserAgent.Should().Be(browserAgent);
        pageView.IsBot.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_FlagsCrawlerTrafficAsBot()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);
        DefaultHttpContext httpContext = CreateHttpContext(
            "66.249.66.1",
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");

        TrackPageView.Request request = new("/", string.Empty, "session-bot-1");

        var result = await TrackPageView.HandleAsync(request, httpContext, DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        PageView? pageView = await DbContext.PageViews.SingleOrDefaultAsync();
        pageView!.IsBot.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_MissingUserAgent_StoresNullAndIsNotABot()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);
        DefaultHttpContext httpContext = CreateHttpContext("198.51.100.30");

        TrackPageView.Request request = new("/", string.Empty, "session-no-ua");

        var result = await TrackPageView.HandleAsync(request, httpContext, DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        PageView? pageView = await DbContext.PageViews.SingleOrDefaultAsync();
        pageView!.UserAgent.Should().BeNull();
        pageView.IsBot.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_TruncatesOverlongUserAgent()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);
        DefaultHttpContext httpContext = CreateHttpContext("198.51.100.31", new string('a', 900));

        TrackPageView.Request request = new("/", string.Empty, "session-long-ua");

        var result = await TrackPageView.HandleAsync(request, httpContext, DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        PageView? pageView = await DbContext.PageViews.SingleOrDefaultAsync();
        pageView!.UserAgent.Should().HaveLength(512);
    }

    private static DefaultHttpContext CreateHttpContext(string ipAddress, string? userAgent = null)
    {
        DefaultHttpContext httpContext = new();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse(ipAddress);

        if (userAgent is not null)
        {
            httpContext.Request.Headers.UserAgent = userAgent;
        }

        return httpContext;
    }
}
