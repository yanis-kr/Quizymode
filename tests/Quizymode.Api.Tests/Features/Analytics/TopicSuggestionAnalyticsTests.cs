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

/// <summary>#322: the three topic-suggestion events follow the catalog rules and carry no text.</summary>
public sealed class TopicSuggestionAnalyticsTests : DatabaseTestFixture
{
    private const string Run = "run-topic-1";

    private static ValidationResult Validate(TrackAnalyticsEvents.EventRequest eventRequest) =>
        new TrackAnalyticsEvents.Validator().Validate(new TrackAnalyticsEvents.Request("s-validate", [eventRequest]));

    [Fact]
    public void Shown_RequiresRunIdAndTotal_AndAllowsTheReasonAsContext()
    {
        Validate(new(AnalyticsEventCatalog.TopicSuggestionShown, "/create/question", "topic", "text", RunId: Run, Total: 5))
            .IsValid.Should().BeTrue();
        Validate(new(AnalyticsEventCatalog.TopicSuggestionShown, "/create/question", "topic", "popular", RunId: Run, Total: 1))
            .IsValid.Should().BeTrue();
        Validate(new(AnalyticsEventCatalog.TopicSuggestionShown, "/create/question", "topic", "popular", RunId: Run, Total: 0))
            .IsValid.Should().BeFalse("shown is only sent when at least one chip rendered");
        Validate(new(AnalyticsEventCatalog.TopicSuggestionShown, "/create/question", "topic", null, RunId: Run))
            .IsValid.Should().BeFalse("total is required");
        Validate(new(AnalyticsEventCatalog.TopicSuggestionShown, "/create/question", "topic", null, Total: 3))
            .IsValid.Should().BeFalse("the run id is required");
    }

    [Fact]
    public void Accepted_RequiresRunIdAndPosition_AndTakesThePathAsContext()
    {
        Validate(new(AnalyticsEventCatalog.TopicSuggestionAccepted, "/create/question", "topic", "tech/ai-ml/llms", RunId: Run, Position: 2))
            .IsValid.Should().BeTrue();
        Validate(new(AnalyticsEventCatalog.TopicSuggestionAccepted, "/create/question", "topic", null, RunId: Run, Position: 1))
            .IsValid.Should().BeTrue("a private save omits the context");
        Validate(new(AnalyticsEventCatalog.TopicSuggestionAccepted, "/create/question", "topic", null, RunId: Run))
            .IsValid.Should().BeFalse("position is required");
        Validate(new(AnalyticsEventCatalog.TopicSuggestionAccepted, "/create/question", "topic", null, RunId: Run, Position: 1, Total: 3))
            .IsValid.Should().BeFalse("total is not allowed on accepted");
    }

    [Fact]
    public void Overridden_RequiresRunId_AndRejectsOtherFields()
    {
        Validate(new(AnalyticsEventCatalog.TopicSuggestionOverridden, "/create/question", "topic", "exams/aws-topics/ec2", RunId: Run))
            .IsValid.Should().BeTrue();
        Validate(new(AnalyticsEventCatalog.TopicSuggestionOverridden, "/create/question", "topic", null))
            .IsValid.Should().BeFalse("the run id is required");
        Validate(new(AnalyticsEventCatalog.TopicSuggestionOverridden, "/create/question", "topic", null, RunId: Run, Position: 1))
            .IsValid.Should().BeFalse("position is not allowed on overridden");
    }

    [Fact]
    public void TopicIsAContextType_AndNoTopicEventIsAFunnelStep()
    {
        AnalyticsEventCatalog.ContextTypes.Should().Contain("topic");
        AnalyticsEventCatalog.FunnelSteps.Should().NotContain(AnalyticsEventCatalog.TopicSuggestionShown)
            .And.NotContain(AnalyticsEventCatalog.TopicSuggestionAccepted)
            .And.NotContain(AnalyticsEventCatalog.TopicSuggestionOverridden);
    }

    [Fact]
    public async Task TheEvents_AreStoredOncePerRun_WithoutAnyTextField()
    {
        Mock<IUserContext> userContext = new();
        userContext.SetupGet(context => context.IsAuthenticated).Returns(false);
        userContext.SetupGet(context => context.UserId).Returns((string?)null);
        TrackAnalyticsEvents.Request request = new(
            "s-topic",
            [
                new(AnalyticsEventCatalog.TopicSuggestionShown, "/create/question", "topic", "text", ClientEventId: "c1", RunId: Run, Total: 4),
                new(AnalyticsEventCatalog.TopicSuggestionShown, "/create/question", "topic", "text", ClientEventId: "c2", RunId: Run, Total: 4),
                new(AnalyticsEventCatalog.TopicSuggestionAccepted, "/create/question", "topic", "tech/ai-ml/llms", ClientEventId: "c3", RunId: Run, Position: 2)
            ]);
        new TrackAnalyticsEvents.Validator().Validate(request).IsValid.Should().BeTrue();

        Result<TrackAnalyticsEvents.Response> result = await TrackAnalyticsEvents.HandleAsync(
            request, new DefaultHttpContext(), DbContext, userContext.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        List<AnalyticsEvent> stored = await DbContext.AnalyticsEvents.OrderBy(e => e.EventName).ToListAsync();
        stored.Should().HaveCount(2, "events with a run id are stored once per (name, run)");
        stored.Select(e => e.EventName).Should().Equal("topic_suggestion_accepted", "topic_suggestion_shown");
        stored.Should().OnlyContain(e => e.ContextType == "topic");
        typeof(TrackAnalyticsEvents.EventRequest).GetProperties().Select(property => property.Name).Should().BeEquivalentTo(
            ["Name", "Path", "ContextType", "ContextId", "ClientEventId", "RunId", "ItemId", "Position", "IsCorrect", "Score", "Total"],
            "no field can carry the suggestion text");
    }
}
