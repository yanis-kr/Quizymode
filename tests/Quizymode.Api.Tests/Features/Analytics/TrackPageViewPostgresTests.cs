using System.Data.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Analytics;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Analytics;

/// <summary>
/// #350: on PostgreSQL the first-hit session snapshot is inserted with <c>ON CONFLICT ("SessionId") DO NOTHING</c>, so the
/// first-session race keeps the winner's row without a unique violation that EF would log at Error. Requires Docker.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class TrackPageViewPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private sealed class ErrorCollector : ILoggerProvider, ILogger
    {
        public List<string> Errors { get; } = [];

        public ILogger CreateLogger(string categoryName) => this;

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Error;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel >= LogLevel.Error)
            {
                Errors.Add(formatter(state, exception));
            }
        }

        public void Dispose()
        {
        }
    }

    /// <summary>Inserts a competing session row right after the handler's existence check returns, as a concurrent first hit would.</summary>
    private sealed class RaceInterceptor(Func<Task> competitor) : DbCommandInterceptor
    {
        private bool _fired;

        public override async ValueTask<DbDataReader> ReaderExecutedAsync(
            DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken cancellationToken = default)
        {
            if (!_fired && command.CommandText.Contains("FROM \"AnalyticsSessions\"", StringComparison.Ordinal))
            {
                _fired = true;
                await competitor();
            }

            return result;
        }
    }

    private static readonly IAttributionClassifier Classifier = new AttributionClassifier();

    private ApplicationDbContext CreateDbContext(ErrorCollector errors, params IInterceptor[] interceptors) => new(
        new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(fixture.ConnectionString)
            .ConfigureWarnings(warnings => warnings.Ignore(RelationalEventId.PendingModelChangesWarning))
            .UseLoggerFactory(LoggerFactory.Create(logging => logging.AddProvider(errors)))
            .AddInterceptors(interceptors)
            .Options);

    private static Task<Result<TrackPageView.Response>> TrackAsync(ApplicationDbContext db, TrackPageView.Request request, Guid? userId = null)
    {
        Mock<IUserContext> userContext = new();
        userContext.SetupGet(context => context.IsAuthenticated).Returns(userId is not null);
        userContext.SetupGet(context => context.UserId).Returns(userId?.ToString());
        Mock<IIpGeolocationService> geo = new();
        geo.Setup(g => g.GetCountryAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync("LV");
        DefaultHttpContext httpContext = new();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("198.51.100.30");
        httpContext.Request.Headers.UserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";

        return TrackPageView.HandleAsync(request, httpContext, db, userContext.Object, Classifier, geo.Object, CancellationToken.None);
    }

    [SkippableFact]
    public async Task FirstHit_InsertsTheSessionSnapshot_ThenLaterHitsLinkTheUser()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string sessionId = "pg-session-" + Guid.NewGuid().ToString("N");
        Guid userId = Guid.NewGuid();
        ErrorCollector errors = new();

        await using (ApplicationDbContext db = CreateDbContext(errors))
        {
            (await TrackAsync(db, new TrackPageView.Request(
                "/categories/science", "?utm_source=news&utm_medium=email", sessionId,
                UtmSource: "news", UtmMedium: "email", AppVersion: "3.102.0"))).IsSuccess.Should().BeTrue();
        }

        await using (ApplicationDbContext db = CreateDbContext(errors))
        {
            (await TrackAsync(db, new TrackPageView.Request("/quiz/science", string.Empty, sessionId), userId)).IsSuccess.Should().BeTrue();
        }

        await using ApplicationDbContext verify = CreateDbContext(errors);
        AnalyticsSession session = await verify.AnalyticsSessions.AsNoTracking().SingleAsync(s => s.SessionId == sessionId);
        session.Id.Should().NotBeEmpty();
        session.LandingPath.Should().Be("/categories/science");
        session.LandingQuery.Should().Be("?utm_source=news&utm_medium=email");
        session.UtmSource.Should().Be("news");
        session.UtmMedium.Should().Be("email");
        session.UtmCampaign.Should().BeNull();
        session.Channel.Should().Be("email");
        session.DeviceClass.Should().Be("mobile");
        session.Country.Should().Be("LV");
        session.AppVersion.Should().Be("3.102.0");
        session.VisitorId.Should().BeNull();
        session.UserId.Should().Be(userId);
        session.FirstSeenUtc.Kind.Should().Be(DateTimeKind.Utc);
        session.CreatedUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
        (await verify.PageViews.CountAsync(p => p.SessionId == sessionId)).Should().Be(2);
        errors.Errors.Should().BeEmpty();
    }

    [SkippableFact]
    public async Task ConcurrentFirstHit_KeepsTheWinnersSnapshot_AndLogsNoError()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string sessionId = "pg-race-" + Guid.NewGuid().ToString("N");
        ErrorCollector errors = new();
        RaceInterceptor race = new(async () =>
        {
            await using ApplicationDbContext other = CreateDbContext(errors);
            other.AnalyticsSessions.Add(new AnalyticsSession
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                FirstSeenUtc = DateTime.UtcNow,
                LandingPath = "/winner",
                Channel = "direct",
                DeviceClass = "desktop",
                CreatedUtc = DateTime.UtcNow,
            });
            await other.SaveChangesAsync();
        });

        await using (ApplicationDbContext db = CreateDbContext(errors, race))
        {
            (await TrackAsync(db, new TrackPageView.Request("/loser", string.Empty, sessionId))).IsSuccess.Should().BeTrue();
        }

        await using ApplicationDbContext verify = CreateDbContext(errors);
        AnalyticsSession session = await verify.AnalyticsSessions.AsNoTracking().SingleAsync(s => s.SessionId == sessionId);
        session.LandingPath.Should().Be("/winner");
        (await verify.PageViews.CountAsync(p => p.SessionId == sessionId)).Should().Be(1);
        errors.Errors.Should().BeEmpty("the race is expected and must not be logged at Error (#350)");
    }
}
