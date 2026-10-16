using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>
/// Backfill and report aggregation for page-hit feature/scope classification (ANALYTICS-004).
/// </summary>
public sealed class PageHitClassificationReportTests : DatabaseTestFixture
{
    private static readonly Guid CollectionId = Guid.Parse("9a8b7c6d-0000-4000-8000-000000000002");

    private static IIpGeolocationService NullGeoService()
    {
        Mock<IIpGeolocationService> mock = new();
        mock.Setup(g => g.GetCountryAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        return mock.Object;
    }

    /// <summary>A hit classified the way TrackPageView classifies it at write time.</summary>
    private static PageView Hit(string sessionId, string path, string query, DateTime createdUtc, bool classify = true)
    {
        PageView pageView = new()
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            IpAddress = "198.51.100.10",
            Path = path,
            QueryString = query,
            Url = path + query,
            UserAgent = "Mozilla/5.0",
            CreatedUtc = createdUtc
        };

        if (classify)
        {
            PageViewClassificationBackfill.Apply(pageView, PageHitClassifier.Classify(path, query));
        }

        return pageView;
    }

    [Fact]
    public async Task Backfill_ClassifiesHistoricalRowsExactlyLikeNewRows()
    {
        DateTime now = DateTime.UtcNow;
        (string Path, string Query)[] urls =
        [
            ("/quiz/geography/item/abc", "?nav=capitals"),
            ($"/explore/collections/{CollectionId}/deck/item/xyz", ""),
            ("/items/add", ""),
            ("/unknown-page", ""),
            ("/categories/science/physics", "")
        ];

        await DbContext.PageViews.AddRangeAsync(urls.Select((url, index) =>
            Hit($"legacy-{index}", url.Path, url.Query, now.AddMinutes(-index), classify: false)));
        await DbContext.SaveChangesAsync();
        DbContext.ChangeTracker.Clear();

        int updated = await PageViewClassificationBackfill.RunAsync(DbContext, CancellationToken.None);
        updated.Should().Be(urls.Length);

        List<PageView> rows = await DbContext.PageViews.AsNoTracking().ToListAsync();
        foreach (PageView row in rows)
        {
            PageHitClassifier.Classification expected = PageHitClassifier.Classify(row.Path, row.QueryString);
            new PageHitClassifier.Classification(row.Area!, row.ScopeType, row.ScopeKey, row.NavPath, row.IsItemStep)
                .Should().Be(expected);
        }

        rows.Single(row => row.Path == "/items/add").Area.Should().Be("create");
        rows.Single(row => row.Path == "/unknown-page").Area.Should().Be("other");

        // Idempotent: a caught-up database does no work.
        (await PageViewClassificationBackfill.RunAsync(DbContext, CancellationToken.None)).Should().Be(0);
    }

    [Fact]
    public async Task PageAnalytics_FeatureAreaTotalsAddUpAndContentScopesResolveCollectionNames()
    {
        DateTime now = DateTime.UtcNow;
        DbContext.Collections.Add(new Collection { Id = CollectionId, Name = "World Capitals", CreatedBy = "owner" });
        await DbContext.PageViews.AddRangeAsync(
            Hit("s1", "/", "", now.AddMinutes(-60)),
            Hit("s1", "/quiz/geography", "?nav=capitals", now.AddMinutes(-59)),
            Hit("s1", "/quiz/geography/item/a", "?nav=capitals", now.AddMinutes(-58)),
            Hit("s1", "/quiz/geography/item/b", "?nav=capitals", now.AddMinutes(-57)),
            Hit("s2", $"/explore/collections/{CollectionId}/deck/item/c", "", now.AddMinutes(-50)),
            Hit("s2", "/items/add", "", now.AddMinutes(-49)),
            Hit("s3", "/promo", "", now.AddMinutes(-40)),
            Hit("s3", "/quiz/geography/item/d", "", now.AddMinutes(-39)),
            // Unclassified row (backfill not yet run) still counts, as "other".
            Hit("s4", "/legacy", "", now.AddMinutes(-30), classify: false));
        await DbContext.SaveChangesAsync();

        var result = await GetPageViewAnalytics.HandleAsync(
            new GetPageViewAnalytics.QueryRequest(Days: 7), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        GetPageViewAnalytics.Response response = result.Value!;

        response.FeatureAreas.Sum(area => area.Hits).Should().Be(response.Summary.TotalPageViews);
        GetPageViewAnalytics.FeatureAreaResponse quiz = response.FeatureAreas.Single(area => area.Area == "quiz");
        quiz.Hits.Should().Be(4);
        quiz.Sessions.Should().Be(2);
        quiz.SessionSharePercent.Should().Be(50.0);
        quiz.ItemSteps.Should().Be(3);
        response.FeatureAreas.Single(area => area.Area == "other").Hits.Should().Be(2);
        response.FeatureAreas.Single(area => area.Area == "create").Hits.Should().Be(1);

        GetPageViewAnalytics.ContentScopeRowResponse geography =
            response.ContentScopes.TopCategories.Single(row => row.Key == "geography");
        geography.Sessions.Should().Be(2);
        geography.ItemSteps.Should().Be(3);
        geography.AvgItemStepsPerSession.Should().Be(1.5);

        response.ContentScopes.TopNavPaths.Should().Contain(row => row.Key == "geography/capitals" && row.Sessions == 1 && row.ItemSteps == 2);

        GetPageViewAnalytics.ContentScopeRowResponse collection = response.ContentScopes.TopCollections.Single();
        collection.Key.Should().Be(CollectionId.ToString());
        collection.Name.Should().Be("World Capitals");
        collection.ItemSteps.Should().Be(1);

        // Raw URL view remains available.
        response.TopPages.Should().Contain(page => page.Path == "/items/add");
    }

    [Fact]
    public async Task Sessions_ReportStudyActivityAndGroupLandingByAreaAndScope()
    {
        DateTime now = DateTime.UtcNow;
        await DbContext.PageViews.AddRangeAsync(
            Hit("study-1", "/quiz/geography", "", now.AddMinutes(-60)),
            Hit("study-1", "/quiz/geography/item/a", "", now.AddMinutes(-59)),
            Hit("study-1", "/quiz/geography/item/b", "", now.AddMinutes(-58)),
            Hit("study-1", "/quiz/geography/item/c", "", now.AddMinutes(-57)),
            Hit("study-2", "/quiz/geography/item/x", "", now.AddMinutes(-50)),
            Hit("browse-1", "/categories", "", now.AddMinutes(-40)),
            Hit("browse-2", "/categories", "", now.AddMinutes(-30)));
        await DbContext.SaveChangesAsync();

        var result = await GetPageViewSessions.HandleAsync(
            new GetPageViewSessions.QueryRequest(Days: 7), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        GetPageViewSessions.Response response = result.Value!;

        response.Summary.StudySessions.Should().Be(2);
        response.Summary.AvgItemStepsPerStudySession.Should().Be(2.0);

        // Both quiz sessions entered at different URLs but share area + category scope.
        GetPageViewSessions.LandingPageResponse quizLanding =
            response.LandingPages.Single(landing => landing.Area == "quiz");
        quizLanding.ScopeType.Should().Be("category");
        quizLanding.ScopeKey.Should().Be("geography");
        quizLanding.Sessions.Should().Be(2);

        response.LandingPages.Single(landing => landing.Area == "browse").Sessions.Should().Be(2);

        response.Sessions.Single(session => session.SessionId == "study-1").ItemSteps.Should().Be(3);
        response.Sessions.Single(session => session.SessionId == "study-1").EntryArea.Should().Be("quiz");
    }

    [Fact]
    public async Task SessionDetail_LabelsEachStepWithItsArea()
    {
        DateTime now = DateTime.UtcNow;
        await DbContext.PageViews.AddRangeAsync(
            Hit("journey", "/", "", now.AddMinutes(-10)),
            Hit("journey", "/explore/science/item/a", "", now.AddMinutes(-9)),
            Hit("journey", "/signup", "", now.AddMinutes(-8), classify: false));
        await DbContext.SaveChangesAsync();

        var result = await GetPageViewSessionDetail.HandleAsync(
            new GetPageViewSessionDetail.QueryRequest("journey"), DbContext, NullGeoService(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Steps.Select(step => step.Area).Should().Equal("home", "flashcards", "auth");
        result.Value.Steps.Select(step => step.IsItemStep).Should().Equal(false, true, false);
    }
}
