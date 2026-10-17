using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>
/// Startup backfill of <see cref="AnalyticsSession"/> rows for pre-existing <see cref="PageView"/>
/// sessions (TRAFFIC-122). Runs the real hosted service against the in-memory SQLite database used
/// by <see cref="DatabaseTestFixture"/>.
/// </summary>
public sealed class AnalyticsSessionBackfillTests : DatabaseTestFixture
{
    private AnalyticsSessionBackfill BuildBackfillService()
    {
        ServiceCollection services = new();
        services.AddScoped(_ => CreateDbContext());
        services.AddSingleton<IAttributionClassifier, AttributionClassifier>();
        ServiceProvider provider = services.BuildServiceProvider();

        return new AnalyticsSessionBackfill(provider, NullLogger<AnalyticsSessionBackfill>.Instance);
    }

    [Fact]
    public async Task StartAsync_CreatesSessionFromEarliestHit_WithParsedUtmAndNoReferrer()
    {
        DateTime earliest = DateTime.UtcNow.AddDays(-30);
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = userId, Subject = "subject-backfill", Email = "backfill@example.com" });
        await DbContext.PageViews.AddRangeAsync(
            Hit("session-backfill", "/categories", "?utm_source=legacy&utm_medium=newsletter", earliest, userId, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
            Hit("session-backfill", "/categories/science", string.Empty, earliest.AddMinutes(5), userId));
        await DbContext.SaveChangesAsync();
        DbContext.ChangeTracker.Clear();

        await BuildBackfillService().StartAsync(CancellationToken.None);

        AnalyticsSession session = await DbContext.AnalyticsSessions.SingleAsync(s => s.SessionId == "session-backfill");
        session.FirstSeenUtc.Should().BeCloseTo(earliest, TimeSpan.FromSeconds(1));
        session.LandingPath.Should().Be("/categories");
        session.LandingQuery.Should().Be("?utm_source=legacy&utm_medium=newsletter");
        session.UtmSource.Should().Be("legacy");
        // utm_medium=newsletter is not the literal "email" medium, so this falls to "campaign".
        session.Channel.Should().Be("campaign");
        session.ReferrerHost.Should().BeNull();
        session.VisitorId.Should().BeNull();
        session.UserId.Should().Be(userId);
        session.DeviceClass.Should().Be("desktop");
    }

    [Fact]
    public async Task StartAsync_NoUserAgentOnEarliestHit_DeviceClassIsUnknown()
    {
        DateTime earliest = DateTime.UtcNow.AddDays(-20);
        await DbContext.PageViews.AddAsync(Hit("session-no-ua", "/", string.Empty, earliest, userId: null, userAgent: null));
        await DbContext.SaveChangesAsync();
        DbContext.ChangeTracker.Clear();

        await BuildBackfillService().StartAsync(CancellationToken.None);

        AnalyticsSession session = await DbContext.AnalyticsSessions.SingleAsync(s => s.SessionId == "session-no-ua");
        session.DeviceClass.Should().Be("unknown");
        session.Channel.Should().Be("direct");
    }

    [Fact]
    public async Task StartAsync_IsIdempotent_RepeatRunInsertsNothingNew()
    {
        DateTime earliest = DateTime.UtcNow.AddDays(-10);
        await DbContext.PageViews.AddAsync(Hit("session-idempotent", "/", string.Empty, earliest, userId: null, userAgent: "Mozilla/5.0"));
        await DbContext.SaveChangesAsync();
        DbContext.ChangeTracker.Clear();

        await BuildBackfillService().StartAsync(CancellationToken.None);
        int countAfterFirstRun = await DbContext.AnalyticsSessions.CountAsync();

        await BuildBackfillService().StartAsync(CancellationToken.None);
        int countAfterSecondRun = await DbContext.AnalyticsSessions.CountAsync();

        countAfterFirstRun.Should().Be(1);
        countAfterSecondRun.Should().Be(1);
    }

    [Fact]
    public async Task StartAsync_SkipsSessionsThatAlreadyHaveAnAnalyticsSessionRow()
    {
        DateTime earliest = DateTime.UtcNow.AddDays(-5);
        await DbContext.PageViews.AddAsync(Hit("session-existing", "/", string.Empty, earliest, userId: null, userAgent: "Mozilla/5.0"));
        await DbContext.AnalyticsSessions.AddAsync(new AnalyticsSession
        {
            Id = Guid.NewGuid(),
            SessionId = "session-existing",
            FirstSeenUtc = earliest,
            LandingPath = "/already-captured",
            LandingQuery = string.Empty,
            Channel = "direct",
            DeviceClass = "mobile",
            CreatedUtc = earliest
        });
        await DbContext.SaveChangesAsync();
        DbContext.ChangeTracker.Clear();

        await BuildBackfillService().StartAsync(CancellationToken.None);

        AnalyticsSession session = await DbContext.AnalyticsSessions.SingleAsync(s => s.SessionId == "session-existing");
        session.LandingPath.Should().Be("/already-captured");
        session.DeviceClass.Should().Be("mobile");
    }

    private static PageView Hit(
        string sessionId,
        string path,
        string queryString,
        DateTime createdUtc,
        Guid? userId,
        string? userAgent = null)
    {
        return new PageView
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            IsAuthenticated = userId.HasValue,
            SessionId = sessionId,
            IpAddress = "198.51.100.10",
            Path = path,
            QueryString = queryString,
            Url = $"{path}{queryString}",
            UserAgent = userAgent,
            CreatedUtc = createdUtc
        };
    }
}
