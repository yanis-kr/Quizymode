using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation.Results;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Features.Analytics;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.StartupExtensions;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Analytics;

public sealed class TrackAnalyticsEventsTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock = new();

    public TrackAnalyticsEventsTests()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);
    }

    private static DefaultHttpContext HttpContext(string userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0")
    {
        DefaultHttpContext context = new();
        context.Request.Headers.UserAgent = userAgent;
        return context;
    }

    private async Task<TrackAnalyticsEvents.Response> Track(
        string sessionId,
        params TrackAnalyticsEvents.EventRequest[] events)
    {
        TrackAnalyticsEvents.Request request = new(sessionId, [.. events]);
        new TrackAnalyticsEvents.Validator().Validate(request).IsValid.Should().BeTrue();

        var result = await TrackAnalyticsEvents.HandleAsync(
            request, HttpContext(), DbContext, _userContextMock.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        return result.Value!;
    }

    private static TrackAnalyticsEvents.EventRequest Completed(string runId, int score = 7, int total = 10) =>
        new(AnalyticsEventCatalog.QuizCompleted, "/quiz/science", "category", "science", RunId: runId, Score: score, Total: total);

    [Fact]
    public async Task HandleAsync_StoresAnonymousEventWithBoundedFieldsAndServerTime()
    {
        DateTime before = DateTime.UtcNow;

        TrackAnalyticsEvents.Response response = await Track(
            "session-anon",
            new TrackAnalyticsEvents.EventRequest(
                AnalyticsEventCatalog.QuickQuizStarted, "/quiz/science?item=abc#top", "quiz", "home-quick", RunId: "run-1", Total: 10));

        response.Should().Be(new TrackAnalyticsEvents.Response(1, 0));
        AnalyticsEvent stored = await DbContext.AnalyticsEvents.SingleAsync();
        stored.EventName.Should().Be("quick_quiz_started");
        stored.SessionId.Should().Be("session-anon");
        stored.Path.Should().Be("/quiz/science", "query strings and fragments are never stored");
        stored.ContextType.Should().Be("quiz");
        stored.ContextId.Should().Be("home-quick");
        stored.RunId.Should().Be("run-1");
        stored.Total.Should().Be(10);
        stored.UserId.Should().BeNull();
        stored.IsAuthenticated.Should().BeFalse();
        stored.IsBot.Should().BeFalse();
        stored.OccurredUtc.Should().BeOnOrAfter(before);
    }

    [Fact]
    public async Task HandleAsync_AssociatesAuthenticatedUser()
    {
        Guid userId = Guid.NewGuid();
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(true);
        _userContextMock.SetupGet(context => context.UserId).Returns(userId.ToString());

        await Track("session-auth", new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SignInCompleted, "/login"));

        AnalyticsEvent stored = await DbContext.AnalyticsEvents.SingleAsync();
        stored.UserId.Should().Be(userId);
        stored.IsAuthenticated.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_RetriedQuizCompletionForSameRun_IsStoredOnce()
    {
        TrackAnalyticsEvents.Response first = await Track("session-1", Completed("run-a"));
        TrackAnalyticsEvents.Response retry = await Track("session-1", Completed("run-a", score: 9));
        TrackAnalyticsEvents.Response replay = await Track("session-1", Completed("run-b"));

        first.Should().Be(new TrackAnalyticsEvents.Response(1, 0));
        retry.Should().Be(new TrackAnalyticsEvents.Response(0, 1));
        replay.Should().Be(new TrackAnalyticsEvents.Response(1, 0), "Play again is a new run");

        List<AnalyticsEvent> completions = await DbContext.AnalyticsEvents.OrderBy(e => e.RunId).ToListAsync();
        completions.Select(e => e.RunId).Should().Equal("run-a", "run-b");
        completions[0].Score.Should().Be(7, "the first completion for a run is kept");
    }

    [Fact]
    public async Task HandleAsync_DuplicatesInsideOneBatch_AreStoredOnce()
    {
        TrackAnalyticsEvents.Response response = await Track("session-2", Completed("run-a"), Completed("run-a"));

        response.Should().Be(new TrackAnalyticsEvents.Response(1, 1));
        (await DbContext.AnalyticsEvents.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_SameRunIdInDifferentSessions_IsStoredForEach()
    {
        await Track("session-x", Completed("run-a"));
        await Track("session-y", Completed("run-a"));

        (await DbContext.AnalyticsEvents.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_ClientEventIdDedupesImpressions_AndEventsWithoutIdsAreKept()
    {
        TrackAnalyticsEvents.EventRequest impression = new(
            AnalyticsEventCatalog.SignupPromptViewed, "/quiz/science", "quiz", "results-panel", ClientEventId: "impression-1");
        TrackAnalyticsEvents.EventRequest untracked = new(AnalyticsEventCatalog.SignupFormStarted, "/signup");

        await Track("session-3", impression, untracked);
        TrackAnalyticsEvents.Response again = await Track("session-3", impression, untracked);

        again.Should().Be(new TrackAnalyticsEvents.Response(1, 1));
        (await DbContext.AnalyticsEvents.CountAsync(e => e.EventName == AnalyticsEventCatalog.SignupPromptViewed)).Should().Be(1);
        (await DbContext.AnalyticsEvents.CountAsync(e => e.EventName == AnalyticsEventCatalog.SignupFormStarted)).Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_FlagsCrawlerEventsAsBot()
    {
        TrackAnalyticsEvents.Request request = new(
            "session-bot",
            [new TrackAnalyticsEvents.EventRequest(AnalyticsEventCatalog.SignupPromptViewed, "/")]);

        await TrackAnalyticsEvents.HandleAsync(
            request,
            HttpContext("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        (await DbContext.AnalyticsEvents.SingleAsync()).IsBot.Should().BeTrue();
    }

    public static TheoryData<string, TrackAnalyticsEvents.EventRequest> InvalidEvents => new()
    {
        { "unknown name", new("page_scrolled", "/") },
        { "blank name", new("", "/") },
        { "absolute url path", new(AnalyticsEventCatalog.SignupSubmitted, "https://evil.example/") },
        { "protocol-relative path", new(AnalyticsEventCatalog.SignupSubmitted, "//evil.example/") },
        { "oversized path", new(AnalyticsEventCatalog.SignupSubmitted, "/" + new string('a', 512)) },
        { "unknown context type", new(AnalyticsEventCatalog.SignupPromptViewed, "/", "email", "x") },
        { "context id without type", new(AnalyticsEventCatalog.SignupPromptViewed, "/", null, "x") },
        { "oversized context id", new(AnalyticsEventCatalog.SignupPromptViewed, "/", "quiz", new string('a', 129)) },
        { "context id with spaces", new(AnalyticsEventCatalog.SignupPromptViewed, "/", "quiz", "has spaces") },
        { "oversized client event id", new(AnalyticsEventCatalog.SignupPromptViewed, "/", ClientEventId: new string('a', 65)) },
        { "completion without run", new(AnalyticsEventCatalog.QuizCompleted, "/", Score: 1, Total: 2) },
        { "completion without score", new(AnalyticsEventCatalog.QuizCompleted, "/", RunId: "r", Total: 2) },
        { "score above total", new(AnalyticsEventCatalog.QuizCompleted, "/", RunId: "r", Score: 3, Total: 2) },
        { "negative score", new(AnalyticsEventCatalog.QuizCompleted, "/", RunId: "r", Score: -1, Total: 2) },
        { "total out of range", new(AnalyticsEventCatalog.QuizCompleted, "/", RunId: "r", Score: 1, Total: 501) },
        { "field not allowed for event", new(AnalyticsEventCatalog.SignupSubmitted, "/", Score: 1) },
        { "item fields reserved for study events", new(AnalyticsEventCatalog.QuizCompleted, "/", RunId: "r", Score: 1, Total: 2, ItemId: Guid.NewGuid()) },
    };

    [Theory]
    [MemberData(nameof(InvalidEvents))]
    public void Validator_RejectsInvalidEvent(string because, TrackAnalyticsEvents.EventRequest invalid)
    {
        ValidationResult result = new TrackAnalyticsEvents.Validator()
            .Validate(new TrackAnalyticsEvents.Request("session", [invalid]));

        result.IsValid.Should().BeFalse(because);
    }

    [Fact]
    public void Validator_RejectsEmptyOversizedOrSessionlessBatches()
    {
        TrackAnalyticsEvents.Validator validator = new();
        TrackAnalyticsEvents.EventRequest valid = new(AnalyticsEventCatalog.SignupSubmitted, "/signup");

        validator.Validate(new TrackAnalyticsEvents.Request("s", [])).IsValid.Should().BeFalse();
        validator.Validate(new TrackAnalyticsEvents.Request("s", null)).IsValid.Should().BeFalse();
        validator.Validate(new TrackAnalyticsEvents.Request("s", [.. Enumerable.Repeat(valid, 26)])).IsValid.Should().BeFalse();
        validator.Validate(new TrackAnalyticsEvents.Request("", [valid])).IsValid.Should().BeFalse();
        validator.Validate(new TrackAnalyticsEvents.Request(new string('s', 129), [valid])).IsValid.Should().BeFalse();
        validator.Validate(new TrackAnalyticsEvents.Request("s", [.. Enumerable.Repeat(valid, 25)])).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Endpoint_IsAnonymousAndRateLimited()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.Services.AddScoped<FluentValidation.IValidator<TrackAnalyticsEvents.Request>, TrackAnalyticsEvents.Validator>();
        builder.Services.AddScoped(_ => DbContext);
        builder.Services.AddSingleton(_userContextMock.Object);
        WebApplication app = builder.Build();

        new TrackAnalyticsEvents.Endpoint().MapEndpoint(app);

        RouteEndpoint endpoint = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(candidate => candidate.RoutePattern.RawText == "analytics/events");

        endpoint.Metadata.GetMetadata<Microsoft.AspNetCore.Authorization.IAllowAnonymous>().Should().NotBeNull();
        endpoint.Metadata.GetMetadata<Microsoft.AspNetCore.RateLimiting.EnableRateLimitingAttribute>()!
            .PolicyName.Should().Be("analytics-events");
    }

    [Fact]
    public async Task RateLimitPolicy_Returns429AfterTheWindowBudget()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.AddRateLimitingServices();
        await using WebApplication app = builder.Build();
        app.UseRateLimiter();
        app.MapPost("/analytics/events", () => Results.Accepted()).RequireRateLimiting("analytics-events");
        await app.StartAsync();

        string address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();
        using HttpClient client = new() { BaseAddress = new Uri(address) };

        List<HttpStatusCode> statuses = [];
        for (int attempt = 0; attempt < 121; attempt++)
        {
            using HttpResponseMessage response = await client.PostAsJsonAsync("/analytics/events", new { });
            statuses.Add(response.StatusCode);
        }

        statuses.Take(120).Should().OnlyContain(status => status == HttpStatusCode.Accepted);
        statuses[^1].Should().Be(HttpStatusCode.TooManyRequests);

        await app.StopAsync();
    }
}
