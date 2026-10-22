using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetLearningReportTests : DatabaseTestFixture
{
    private static readonly DateTime Now = DateTime.UtcNow;

    private static AnalyticsEvent Event(
        string sessionId,
        string name,
        string runId,
        int? position = null,
        bool? isCorrect = null,
        int? score = null,
        int? total = null,
        string contextType = "collection",
        string contextId = "c-1",
        bool isBot = false,
        bool isInternal = false) => new()
    {
        Id = Guid.NewGuid(),
        EventName = name,
        SessionId = sessionId,
        Path = "/",
        RunId = runId,
        ItemId = position is null ? null : Guid.NewGuid(),
        Position = position,
        IsCorrect = isCorrect,
        Score = score,
        Total = total,
        ContextType = contextType,
        ContextId = contextId,
        IsBot = isBot,
        IsInternal = isInternal,
        OccurredUtc = Now.AddMinutes(-10)
    };

    private static IEnumerable<AnalyticsEvent> QuizRun(string sessionId, string runId, int questions, int answered, bool completed, int score = 0, bool isInternal = false, bool isBot = false)
    {
        yield return Event(sessionId, AnalyticsEventCatalog.QuickQuizStarted, runId, total: questions, isInternal: isInternal, isBot: isBot);
        for (int position = 1; position <= answered; position++)
        {
            yield return Event(sessionId, AnalyticsEventCatalog.QuestionAnswered, runId, position: position, isCorrect: position <= score, isInternal: isInternal, isBot: isBot);
        }

        if (completed)
        {
            yield return Event(sessionId, AnalyticsEventCatalog.QuizCompleted, runId, score: score, total: questions, isInternal: isInternal, isBot: isBot);
        }
    }

    private Task<Result<GetLearningReport.Response>> Run(GetLearningReport.QueryRequest request) =>
        GetLearningReport.HandleAsync(request, DbContext, CancellationToken.None);

    [Fact]
    public async Task HandleAsync_ReportsCompletionScoresAndDropOff()
    {
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s1", "r-done", questions: 10, answered: 10, completed: true, score: 8));
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s2", "r-four", questions: 10, answered: 4, completed: false));
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s3", "r-none", questions: 10, answered: 0, completed: false));
        await DbContext.AnalyticsEvents.AddRangeAsync(
            Event("s4", AnalyticsEventCatalog.FlashcardsStarted, "f-1", total: 5, contextType: "category", contextId: "science"),
            Event("s4", AnalyticsEventCatalog.FlashcardRevealed, "f-1", position: 1, contextType: "category", contextId: "science"),
            Event("s4", AnalyticsEventCatalog.FlashcardRevealed, "f-1", position: 2, contextType: "category", contextId: "science"));
        // An answer without a stored start is not a run.
        await DbContext.AnalyticsEvents.AddAsync(Event("s5", AnalyticsEventCatalog.QuestionAnswered, "r-orphan", position: 1, isCorrect: true));
        await DbContext.SaveChangesAsync();

        GetLearningReport.Response report = (await Run(new GetLearningReport.QueryRequest(Days: 7))).Value!;

        GetLearningReport.ScopeResponse quiz = report.Scopes.Single(scope => scope.Mode == GetLearningReport.QuizMode);
        quiz.ContextType.Should().Be("collection");
        quiz.ContextId.Should().Be("c-1");
        quiz.RunsStarted.Should().Be(3);
        quiz.RunsCompleted.Should().Be(1);
        quiz.CompletionRatePercent.Should().Be(33.3);
        quiz.AverageScorePercent.Should().Be(80.0);
        quiz.AverageItemsReached.Should().Be(4.7);

        GetLearningReport.ScopeResponse flashcards = report.Scopes.Single(scope => scope.Mode == GetLearningReport.FlashcardsMode);
        flashcards.ContextId.Should().Be("science");
        flashcards.RunsStarted.Should().Be(1);
        flashcards.RunsCompleted.Should().BeNull();
        flashcards.AverageItemsReached.Should().Be(2.0);

        report.QuizRunsAbandonedBeforeFirstAnswer.Should().Be(1);
        report.QuizDropOff.Should().HaveCount(10);
        report.QuizDropOff[0].Should().Be(new GetLearningReport.DropOffPointResponse(1, 2, 66.7, 0));
        report.QuizDropOff[3].Should().Be(new GetLearningReport.DropOffPointResponse(4, 2, 66.7, 1));
        report.QuizDropOff[4].Should().Be(new GetLearningReport.DropOffPointResponse(5, 1, 33.3, 0));
        report.QuizDropOff[9].Should().Be(new GetLearningReport.DropOffPointResponse(10, 1, 33.3, 0));
    }

    [Fact]
    public async Task HandleAsync_ReportsLearnRunsAsTheirOwnModeAndKeepsThemOutOfQuizDropOff()
    {
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s1", "q-done", questions: 3, answered: 3, completed: true, score: 3));
        // A Learn run that answered every item once but never finished must not look like a quiz abandoned at position 3.
        await DbContext.AnalyticsEvents.AddRangeAsync(
            Event("s2", AnalyticsEventCatalog.QuickQuizStarted, "l-open", total: 3, contextType: "learn", contextId: "category:science"),
            Event("s2", AnalyticsEventCatalog.QuestionAnswered, "l-open", position: 1, isCorrect: true, contextType: "learn", contextId: "category:science"),
            Event("s2", AnalyticsEventCatalog.QuestionAnswered, "l-open", position: 2, isCorrect: false, contextType: "learn", contextId: "category:science"),
            Event("s2", AnalyticsEventCatalog.QuestionAnswered, "l-open", position: 3, isCorrect: true, contextType: "learn", contextId: "category:science"));
        await DbContext.AnalyticsEvents.AddRangeAsync(
            Event("s3", AnalyticsEventCatalog.QuickQuizStarted, "l-done", total: 4, contextType: "learn", contextId: "category:science"),
            Event("s3", AnalyticsEventCatalog.QuizCompleted, "l-done", score: 3, total: 4, contextType: "learn", contextId: "category:science"));
        await DbContext.SaveChangesAsync();

        GetLearningReport.Response report = (await Run(new GetLearningReport.QueryRequest(Days: 7))).Value!;

        GetLearningReport.ScopeResponse learn = report.Scopes.Single(scope => scope.Mode == GetLearningReport.LearnMode);
        learn.ContextType.Should().Be("learn");
        learn.ContextId.Should().Be("category:science");
        learn.RunsStarted.Should().Be(2);
        learn.RunsCompleted.Should().Be(1);
        learn.AverageScorePercent.Should().Be(75.0);

        GetLearningReport.ScopeResponse quiz = report.Scopes.Single(scope => scope.Mode == GetLearningReport.QuizMode);
        quiz.RunsStarted.Should().Be(1);
        report.QuizDropOff.Should().HaveCount(3);
        report.QuizDropOff[0].RunsReached.Should().Be(1);
        report.QuizDropOff.Sum(point => point.RunsAbandonedHere).Should().Be(0);
        report.QuizRunsAbandonedBeforeFirstAnswer.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_ExcludesBotAndInternalSessionsUnlessRequested()
    {
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s-visitor", "r1", questions: 3, answered: 3, completed: true, score: 3));
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s-internal", "r2", questions: 3, answered: 1, completed: false, isInternal: true));
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s-bot", "r3", questions: 3, answered: 0, completed: false, isBot: true));
        await DbContext.SaveChangesAsync();

        GetLearningReport.Response excluded = (await Run(new GetLearningReport.QueryRequest(Days: 7))).Value!;
        excluded.Scopes.Single().RunsStarted.Should().Be(1);
        excluded.InternalSessions.Should().Be(1);
        excluded.BotSessions.Should().Be(1);
        excluded.InternalExcluded.Should().BeTrue();
        excluded.BotsExcluded.Should().BeTrue();

        GetLearningReport.Response included = (await Run(new GetLearningReport.QueryRequest(Days: 7, IncludeBots: true, IncludeInternal: true))).Value!;
        included.Scopes.Single().RunsStarted.Should().Be(3);
        included.QuizRunsAbandonedBeforeFirstAnswer.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_EmptyWindow_ReturnsNoScopesOrDropOff()
    {
        GetLearningReport.Response report = (await Run(new GetLearningReport.QueryRequest(Days: 7))).Value!;

        report.Scopes.Should().BeEmpty();
        report.QuizDropOff.Should().BeEmpty();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(366)]
    public async Task HandleAsync_InvalidDays_ReturnsValidationError(int days)
    {
        Result<GetLearningReport.Response> result = await Run(new GetLearningReport.QueryRequest(days));

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    private static AnalyticsSession Session(string sessionId, string? visitorId, string channel, int minutesAgo) => new()
    {
        Id = Guid.NewGuid(),
        SessionId = sessionId,
        VisitorId = visitorId,
        FirstSeenUtc = Now.AddMinutes(-minutesAgo),
        Channel = channel,
        DeviceClass = "desktop",
        CreatedUtc = Now.AddMinutes(-minutesAgo)
    };

    [Fact]
    public async Task HandleAsync_ChannelAndVisitorTypeFilters_LimitEveryFigure()
    {
        // v1: first session s-new (search) and a later one s-ret (search). v2: only s-other (social, new).
        await DbContext.AnalyticsSessions.AddRangeAsync(
            Session("s-new", "v1", "search", minutesAgo: 600),
            Session("s-ret", "v1", "search", minutesAgo: 60),
            Session("s-other", "v2", "social", minutesAgo: 30));
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s-new", "r1", questions: 4, answered: 4, completed: true, score: 4));
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s-ret", "r2", questions: 4, answered: 2, completed: false));
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s-other", "r3", questions: 4, answered: 1, completed: false));
        await DbContext.AnalyticsEvents.AddRangeAsync(QuizRun("s-nosnap", "r4", questions: 4, answered: 3, completed: false));
        await DbContext.SaveChangesAsync();

        GetLearningReport.Response all = (await Run(new GetLearningReport.QueryRequest(Days: 7))).Value!;
        all.Scopes.Single().RunsStarted.Should().Be(4);

        GetLearningReport.Response search = (await Run(new GetLearningReport.QueryRequest(Days: 7, Channel: "Search"))).Value!;
        search.Scopes.Single().RunsStarted.Should().Be(2);
        search.Scopes.Single().RunsCompleted.Should().Be(1);
        search.Scopes.Single().AverageItemsReached.Should().Be(3.0);
        search.QuizDropOff.Should().HaveCount(4);

        GetLearningReport.Response unknown = (await Run(new GetLearningReport.QueryRequest(Days: 7, Channel: "unknown"))).Value!;
        unknown.Scopes.Single().RunsStarted.Should().Be(1);
        unknown.Scopes.Single().AverageItemsReached.Should().Be(3.0);

        GetLearningReport.Response returning = (await Run(new GetLearningReport.QueryRequest(Days: 7, VisitorType: "returning"))).Value!;
        returning.Scopes.Single().RunsStarted.Should().Be(1);
        returning.Scopes.Single().RunsCompleted.Should().Be(0);
        returning.QuizDropOff.Should().HaveCount(2);

        GetLearningReport.Response newVisitors = (await Run(new GetLearningReport.QueryRequest(Days: 7, VisitorType: "new"))).Value!;
        newVisitors.Scopes.Single().RunsStarted.Should().Be(2);

        GetLearningReport.Response both = (await Run(new GetLearningReport.QueryRequest(Days: 7, Channel: "search", VisitorType: "new"))).Value!;
        both.Scopes.Single().RunsStarted.Should().Be(1);
        both.Scopes.Single().RunsCompleted.Should().Be(1);
        both.Scopes.Single().AverageScorePercent.Should().Be(100.0);

        GetLearningReport.Response none = (await Run(new GetLearningReport.QueryRequest(Days: 7, Channel: "paid"))).Value!;
        none.Scopes.Should().BeEmpty();
    }

    [Theory]
    [InlineData("tv", null)]
    [InlineData(null, "everyone")]
    public async Task HandleAsync_UnknownFilterValues_ReturnValidationError(string? channel, string? visitorType)
    {
        Result<GetLearningReport.Response> result = await Run(new GetLearningReport.QueryRequest(7, Channel: channel, VisitorType: visitorType));

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }
}
