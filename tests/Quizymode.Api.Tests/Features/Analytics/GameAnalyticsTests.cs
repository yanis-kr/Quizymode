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

/// <summary>#353: game_started / game_completed follow the catalog rules and carry no item text or timing.</summary>
public sealed class GameAnalyticsTests : DatabaseTestFixture
{
    private const string Run = "run-game-1";
    private const string Context = "match-race:category:Spanish";

    private static ValidationResult Validate(TrackAnalyticsEvents.EventRequest eventRequest) =>
        new TrackAnalyticsEvents.Validator().Validate(new TrackAnalyticsEvents.Request("s-validate", [eventRequest]));

    [Fact]
    public void Started_RequiresRunIdAndTotal()
    {
        Validate(new(AnalyticsEventCatalog.GameStarted, "/games/match-race", "game", Context, RunId: Run, Total: 6))
            .IsValid.Should().BeTrue();
        Validate(new(AnalyticsEventCatalog.GameStarted, "/games/match-race", "game", Context, RunId: Run))
            .IsValid.Should().BeFalse("total is required");
        Validate(new(AnalyticsEventCatalog.GameStarted, "/games/match-race", "game", Context, Total: 6))
            .IsValid.Should().BeFalse("the run id is required");
    }

    [Fact]
    public void Completed_RequiresRunIdScoreAndTotal_AndScoreCannotExceedTotal()
    {
        Validate(new(AnalyticsEventCatalog.GameCompleted, "/games/match-race", "game", Context, RunId: Run, Score: 4, Total: 6))
            .IsValid.Should().BeTrue();
        Validate(new(AnalyticsEventCatalog.GameCompleted, "/games/match-race", "game", Context, RunId: Run, Total: 6))
            .IsValid.Should().BeFalse("score is required");
        Validate(new(AnalyticsEventCatalog.GameCompleted, "/games/match-race", "game", Context, RunId: Run, Score: 4))
            .IsValid.Should().BeFalse("total is required");
        Validate(new(AnalyticsEventCatalog.GameCompleted, "/games/match-race", "game", Context, RunId: Run, Score: 7, Total: 6))
            .IsValid.Should().BeFalse("score cannot exceed total");
    }

    [Fact]
    public void GameEvents_RejectItemLevelFields()
    {
        Validate(new(AnalyticsEventCatalog.GameStarted, "/games/match-race", "game", Context, RunId: Run, Total: 3, ItemId: Guid.NewGuid()))
            .IsValid.Should().BeFalse();
        Validate(new(AnalyticsEventCatalog.GameCompleted, "/games/match-race", "game", Context, RunId: Run, Score: 1, Total: 3, Position: 1))
            .IsValid.Should().BeFalse();
        Validate(new(AnalyticsEventCatalog.GameCompleted, "/games/match-race", "game", Context, RunId: Run, Score: 1, Total: 3, IsCorrect: true))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void GameIsAContextType_AndUnknownContextTypesAreStillRejected()
    {
        AnalyticsEventCatalog.ContextTypes.Should().Contain("game");
        Validate(new(AnalyticsEventCatalog.GameStarted, "/games/match-race", "arcade", Context, RunId: Run, Total: 3))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void NoGameEventIsAFunnelStep()
    {
        AnalyticsEventCatalog.FunnelSteps.Should().NotContain(AnalyticsEventCatalog.GameStarted)
            .And.NotContain(AnalyticsEventCatalog.GameCompleted);
    }

    [Fact]
    public async Task TheEvents_AreStoredOncePerRun()
    {
        Mock<IUserContext> userContext = new();
        userContext.SetupGet(context => context.IsAuthenticated).Returns(false);
        userContext.SetupGet(context => context.UserId).Returns((string?)null);
        TrackAnalyticsEvents.Request request = new(
            "s-game",
            [
                new(AnalyticsEventCatalog.GameStarted, "/games/match-race", "game", Context, ClientEventId: "g1", RunId: Run, Total: 6),
                new(AnalyticsEventCatalog.GameStarted, "/games/match-race", "game", Context, ClientEventId: "g2", RunId: Run, Total: 6),
                new(AnalyticsEventCatalog.GameCompleted, "/games/match-race", "game", Context, ClientEventId: "g3", RunId: Run, Score: 5, Total: 6)
            ]);
        new TrackAnalyticsEvents.Validator().Validate(request).IsValid.Should().BeTrue();

        Result<TrackAnalyticsEvents.Response> result = await TrackAnalyticsEvents.HandleAsync(
            request, new DefaultHttpContext(), DbContext, userContext.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        List<AnalyticsEvent> stored = await DbContext.AnalyticsEvents.OrderBy(e => e.EventName).ToListAsync();
        stored.Should().HaveCount(2, "events with a run id are stored once per (name, run)");
        stored.Select(e => e.EventName).Should().Equal("game_completed", "game_started");
        stored.Should().OnlyContain(e => e.ContextType == "game");
    }
}
