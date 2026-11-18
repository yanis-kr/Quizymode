using FluentAssertions;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

// #715: second-activity and cross-topic starts per session. Each scenario is a fixture with hand-counted expectations.
public sealed class GetSecondActivityReportTests : DatabaseTestFixture
{
    private static PageView Hit(string sessionId, DateTime createdUtc, bool isBot = false) => new()
    {
        Id = Guid.NewGuid(),
        SessionId = sessionId,
        IpAddress = "198.51.100.10",
        Path = "/",
        QueryString = string.Empty,
        Url = "/",
        UserAgent = "Mozilla/5.0",
        IsBot = isBot,
        CreatedUtc = createdUtc,
    };

    private static AnalyticsEvent Event(string sessionId, string name, DateTime occurredUtc, string? runId = null, string? contextType = null, string? contextId = null, bool isBot = false) => new()
    {
        Id = Guid.NewGuid(),
        EventName = name,
        SessionId = sessionId,
        Path = "/",
        RunId = runId,
        ContextType = contextType,
        ContextId = contextId,
        IsBot = isBot,
        OccurredUtc = occurredUtc,
    };

    private Task<Result<GetSecondActivityReport.Response>> Run(bool includeBots = false) =>
        GetSecondActivityReport.HandleAsync(14, includeBots, false, DbContext, CancellationToken.None);

    [Fact]
    public async Task HandleAsync_ClassifiesSecondStartsAgainstTheFirstActivity()
    {
        DateTime now = DateTime.UtcNow;

        // A: category geography, then a game in history. Other topic.
        // B: collection c1 twice. Same scope.
        // C: category geography, then survival:global. Unknown (no category in the game id).
        // D: a start that never completes. Not qualifying.
        await DbContext.PageViews.AddRangeAsync(
            Hit("A", now.AddMinutes(-60)), Hit("B", now.AddMinutes(-60)), Hit("C", now.AddMinutes(-60)), Hit("D", now.AddMinutes(-60)));
        await DbContext.AnalyticsEvents.AddRangeAsync(
            Event("A", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-55), "rA1", "category", "geography"),
            Event("A", AnalyticsEventCatalog.QuizCompleted, now.AddMinutes(-54), "rA1"),
            Event("A", AnalyticsEventCatalog.GameStarted, now.AddMinutes(-50), "rA2", "game", "match-race:category:history"),

            Event("B", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-55), "rB1", "collection", "c1"),
            Event("B", AnalyticsEventCatalog.QuizCompleted, now.AddMinutes(-54), "rB1"),
            Event("B", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-50), "rB2", "collection", "c1"),

            Event("C", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-55), "rC1", "category", "geography"),
            Event("C", AnalyticsEventCatalog.QuizCompleted, now.AddMinutes(-54), "rC1"),
            Event("C", AnalyticsEventCatalog.GameStarted, now.AddMinutes(-50), "rC2", "game", "survival:global"),

            Event("D", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-55), "rD1", "category", "geography"));
        await DbContext.SaveChangesAsync();

        Result<GetSecondActivityReport.Response> result = await Run();

        result.IsSuccess.Should().BeTrue();
        GetSecondActivityReport.Response response = result.Value!;
        response.QualifyingSessions.Should().Be(3);
        response.SecondStartedSessions.Should().Be(3);
        response.Second.Should().Be(new GetSecondActivityReport.Breakdown(SameScope: 1, OtherTopic: 1, SameTopicDifferentScope: 0, Unknown: 1));
        response.RatesSuppressed.Should().BeTrue("fewer than 20 qualifying sessions");
        response.SecondStartedPercent.Should().BeNull();
        response.Note.Should().Be("Too few sessions for rates.");
    }

    [Fact]
    public async Task HandleAsync_ExcludesBotSessionsUnlessRequested()
    {
        DateTime now = DateTime.UtcNow;
        await DbContext.PageViews.AddRangeAsync(Hit("bot", now.AddMinutes(-60), isBot: true));
        await DbContext.AnalyticsEvents.AddRangeAsync(
            Event("bot", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-55), "rBot", "category", "geography", isBot: true),
            Event("bot", AnalyticsEventCatalog.QuizCompleted, now.AddMinutes(-54), "rBot", isBot: true),
            Event("bot", AnalyticsEventCatalog.GameStarted, now.AddMinutes(-50), "rBot2", "game", "match-race:category:history", isBot: true));
        await DbContext.SaveChangesAsync();

        (await Run()).Value!.QualifyingSessions.Should().Be(0);
        (await Run(includeBots: true)).Value!.QualifyingSessions.Should().Be(1);
    }

    [Theory]
    [InlineData("category", "exams/aws/saa-c03", "exams")]
    [InlineData("game", "match-race:category:geography", "geography")]
    [InlineData("game", "survival:global", "none")]
    [InlineData("collection", "c1", "collection:c1")]
    [InlineData("home", "", "none")]
    [InlineData("daily", "2026-11-18", "daily")]
    [InlineData("learn", "geography/capitals", "geography")]
    [InlineData("unknown", "x", "none")]
    public void TopicKey_ReadsTheTopicFromTheStartContext(string contextType, string contextId, string expected)
    {
        var row = new GetSecondActivityReport.EventRow("s", "quick_quiz_started", "r", contextType, contextId, DateTime.UtcNow);
        GetSecondActivityReport.TopicKey(row).Should().Be(expected);
    }
}
