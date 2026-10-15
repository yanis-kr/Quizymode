using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetConversionFunnelTests : DatabaseTestFixture
{
    private static AnalyticsEvent Event(string sessionId, string name, DateTime occurredUtc, bool isBot = false) => new()
    {
        Id = Guid.NewGuid(),
        EventName = name,
        SessionId = sessionId,
        Path = "/",
        IsBot = isBot,
        OccurredUtc = occurredUtc
    };

    private Task<Result<GetConversionFunnel.Response>> Run(GetConversionFunnel.QueryRequest request) =>
        GetConversionFunnel.HandleAsync(request, DbContext, CancellationToken.None);

    [Fact]
    public async Task HandleAsync_CountsUniqueSessionsAndStepConversion()
    {
        DateTime now = DateTime.UtcNow;
        await DbContext.AnalyticsEvents.AddRangeAsync(
            // Four sessions start a quick quiz; s1 starts twice (two runs) but is one session.
            Event("s1", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-50)),
            Event("s1", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-40)),
            Event("s2", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-50)),
            Event("s3", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-50)),
            Event("s4", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-50)),
            // Two complete, one of them views and clicks the prompt.
            Event("s1", AnalyticsEventCatalog.QuizCompleted, now.AddMinutes(-45)),
            Event("s2", AnalyticsEventCatalog.QuizCompleted, now.AddMinutes(-45)),
            Event("s1", AnalyticsEventCatalog.SignupPromptViewed, now.AddMinutes(-44)),
            Event("s1", AnalyticsEventCatalog.SignupPromptClicked, now.AddMinutes(-43)),
            // Outside the window.
            Event("old", AnalyticsEventCatalog.QuickQuizStarted, now.AddDays(-10)));
        await DbContext.SaveChangesAsync();

        Result<GetConversionFunnel.Response> result = await Run(new GetConversionFunnel.QueryRequest(Days: 7));

        result.IsSuccess.Should().BeTrue();
        GetConversionFunnel.Response response = result.Value!;
        response.SessionsWithEvents.Should().Be(4);
        response.Steps.Select(step => step.EventName).Should().Equal(AnalyticsEventCatalog.FunnelSteps);

        GetConversionFunnel.StepResponse started = response.Steps[0];
        started.Sessions.Should().Be(4);
        started.Events.Should().Be(5);
        started.ConversionFromPreviousPercent.Should().BeNull();

        GetConversionFunnel.StepResponse completed = response.Steps[1];
        completed.Sessions.Should().Be(2);
        completed.ConversionFromPreviousPercent.Should().Be(50.0);
        completed.ConversionFromFirstPercent.Should().Be(50.0);

        response.Steps[2].ConversionFromPreviousPercent.Should().Be(50.0);
        response.Steps[3].ConversionFromPreviousPercent.Should().Be(100.0);
        response.Steps[3].ConversionFromFirstPercent.Should().Be(25.0);

        // A step after an empty step has no meaningful step-to-step rate.
        response.Steps[4].Sessions.Should().Be(0);
        response.Steps[5].ConversionFromPreviousPercent.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ExcludesBotsUnlessRequested()
    {
        DateTime now = DateTime.UtcNow;
        await DbContext.AnalyticsEvents.AddRangeAsync(
            Event("human", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-5)),
            Event("crawler", AnalyticsEventCatalog.QuickQuizStarted, now.AddMinutes(-5), isBot: true));
        await DbContext.SaveChangesAsync();

        GetConversionFunnel.Response excluded = (await Run(new GetConversionFunnel.QueryRequest())).Value!;
        GetConversionFunnel.Response included = (await Run(new GetConversionFunnel.QueryRequest(IncludeBots: true))).Value!;

        excluded.Steps[0].Sessions.Should().Be(1);
        excluded.BotSessions.Should().Be(1);
        excluded.BotsExcluded.Should().BeTrue();
        included.Steps[0].Sessions.Should().Be(2);
        included.BotsExcluded.Should().BeFalse();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(366)]
    public async Task HandleAsync_InvalidDays_ReturnsValidationError(int days)
    {
        Result<GetConversionFunnel.Response> result = await Run(new GetConversionFunnel.QueryRequest(days));

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public void Endpoint_RequiresAdminPolicy_SoNonAdminsGet403()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.Services.AddScoped<ApplicationDbContext>(_ => DbContext);
        WebApplication app = builder.Build();

        new GetConversionFunnel.Endpoint().MapEndpoint(app);

        RouteEndpoint endpoint = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(candidate => candidate.RoutePattern.RawText == "admin/analytics/funnel");

        endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Should().Contain(data => data.Policy == "Admin");
    }
}
