using FluentAssertions;
using FluentValidation.Results;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Analytics;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Analytics;

/// <summary>#324: the search text must never be stored, and the two search events follow the catalog rules.</summary>
public sealed class SearchAnalyticsTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContext = new();

    public SearchAnalyticsTests()
    {
        _userContext.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContext.SetupGet(context => context.UserId).Returns((string?)null);
    }

    private async Task<PageView> TrackAsync(TrackPageView.Request request)
    {
        Mock<IIpGeolocationService> geo = new();
        DefaultHttpContext httpContext = new();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("198.51.100.77");

        Result<TrackPageView.Response> result = await TrackPageView.HandleAsync(
            request, httpContext, DbContext, _userContext.Object, new AttributionClassifier(), geo.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        return await DbContext.PageViews.SingleAsync();
    }

    [Theory]
    [InlineData("/search", "?q=secret+words")]
    [InlineData("/search", "q=secret words&x=1")]
    [InlineData("/search/", "?q=secret")]
    [InlineData("/SEARCH", "?Q=secret")]
    public async Task PageView_ForSearchPath_DropsTheQueryString(string path, string queryString)
    {
        PageView pageView = await TrackAsync(new TrackPageView.Request(path, queryString, "s-search"));

        pageView.QueryString.Should().BeEmpty();
        pageView.Url.Should().NotContain("secret");
        pageView.Area.Should().Be("search");
    }

    [Fact]
    public async Task PageView_ForSearchPath_DropsAQueryStuffedIntoThePath()
    {
        PageView pageView = await TrackAsync(new TrackPageView.Request("/search?q=secret", null, "s-search-path"));

        pageView.Path.Should().Be("/search");
        pageView.Url.Should().NotContain("secret");
        pageView.QueryString.Should().BeEmpty();
    }

    [Fact]
    public async Task PageView_ForOtherPaths_KeepsTheQueryString()
    {
        PageView pageView = await TrackAsync(new TrackPageView.Request("/categories/science", "?q=kept", "s-other"));

        pageView.QueryString.Should().Be("?q=kept");
    }

    [Theory]
    [InlineData("/search", true)]
    [InlineData("/search/", true)]
    [InlineData("/search?q=x", true)]
    [InlineData("/search#top", true)]
    [InlineData("/searchable", false)]
    [InlineData("/categories/search", false)]
    public void IsSearchPath_MatchesOnlyTheSearchRoute(string path, bool expected)
    {
        TrackPageView.IsSearchPath(path).Should().Be(expected);
    }

    [Fact]
    public void SearchPerformed_RequiresTotal_AndAllowsZero()
    {
        Validate(new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SearchPerformed, "/search", "search", null, Total: 0))
            .IsValid.Should().BeTrue();
        Validate(new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SearchPerformed, "/search", "search", null, Total: 501))
            .IsValid.Should().BeFalse();
        Validate(new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SearchPerformed, "/search", "search", null))
            .IsValid.Should().BeFalse();
        Validate(new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SearchPerformed, "/search", "search", null, Total: 3, Position: 1))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void SearchResultClicked_RequiresPosition()
    {
        Validate(new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SearchResultClicked, "/search", "collection", Guid.NewGuid().ToString(), Position: 2))
            .IsValid.Should().BeTrue();
        Validate(new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SearchResultClicked, "/search", "mine", null, Position: 1))
            .IsValid.Should().BeTrue();
        Validate(new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SearchResultClicked, "/search", "item", null))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void ContextTypes_IncludeSearchItemAndMine_AndSearchEventsAreNotFunnelSteps()
    {
        AnalyticsEventCatalog.ContextTypes.Should().Contain(["search", "item", "mine"]);
        AnalyticsEventCatalog.FunnelSteps.Should().NotContain(AnalyticsEventCatalog.SearchPerformed)
            .And.NotContain(AnalyticsEventCatalog.SearchResultClicked);
    }

    [Fact]
    public async Task SearchPerformed_IsStoredWithoutAnyTextField()
    {
        TrackAnalyticsEvents.EventRequest performed = new(AnalyticsEventCatalog.SearchPerformed, "/search", "search", null, ClientEventId: "c1", Total: 4);
        TrackAnalyticsEvents.Request request = new("s-events", [performed]);
        new TrackAnalyticsEvents.Validator().Validate(request).IsValid.Should().BeTrue();

        Result<TrackAnalyticsEvents.Response> result = await TrackAnalyticsEvents.HandleAsync(
            request, new DefaultHttpContext(), DbContext, _userContext.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        AnalyticsEvent stored = await DbContext.AnalyticsEvents.SingleAsync();
        stored.EventName.Should().Be("search_performed");
        stored.ContextType.Should().Be("search");
        stored.Total.Should().Be(4);
        typeof(TrackAnalyticsEvents.EventRequest).GetProperties().Select(property => property.Name).Should().BeEquivalentTo(
            ["Name", "Path", "ContextType", "ContextId", "ClientEventId", "RunId", "ItemId", "Position", "IsCorrect", "Score", "Total"],
            "no field can carry the search text");
    }

    private static ValidationResult Validate(TrackAnalyticsEvents.EventRequest eventRequest) =>
        new TrackAnalyticsEvents.Validator().Validate(new TrackAnalyticsEvents.Request("s-validate", [eventRequest]));
}
