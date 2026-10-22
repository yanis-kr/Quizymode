using FluentAssertions;
using Quizymode.Api.Features.StudySessions;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudySessions;

public sealed class StudySessionTests : DatabaseTestFixture
{
    private static RecordStudySession.Request NewRequest(
        string runId = "run-1",
        int correct = 7,
        int total = 10,
        List<Guid>? missed = null,
        DateTime? completedAt = null) =>
        new(
            runId,
            completedAt ?? DateTime.UtcNow.AddMinutes(-1),
            correct,
            total,
            new RecordStudySession.SourceDto("category", null, "geography", new List<string> { "europe" }, new List<string>()),
            missed ?? new List<Guid> { Guid.NewGuid(), Guid.NewGuid() });

    [Fact]
    public async Task Record_NewRun_CreatesSessionWithMissedItems()
    {
        RecordStudySession.Request request = NewRequest();

        Result<RecordStudySession.Response> result = await RecordStudySession.HandleAsync(
            request, StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Created.Should().BeTrue();
        result.Value.Session.Correct.Should().Be(7);
        result.Value.Session.Source!.CategorySlug.Should().Be("geography");
        result.Value.Session.Source.NavigationKeywords.Should().Equal("europe");
        result.Value.Session.MissedItemIds.Should().BeEquivalentTo(request.MissedItemIds);
        DbContext.StudySessions.Count().Should().Be(1);
        DbContext.StudySessionMissedItems.Count().Should().Be(2);
    }

    [Fact]
    public async Task Record_OmittedMode_DefaultsToQuiz()
    {
        Result<RecordStudySession.Response> result = await RecordStudySession.HandleAsync(
            NewRequest(), StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);

        result.Value.Session.Mode.Should().Be("quiz");
        DbContext.StudySessions.Single().Mode.Should().Be("quiz");
    }

    [Fact]
    public async Task Record_LearnMode_IsPersistedAndReturnedByList()
    {
        Result<RecordStudySession.Response> result = await RecordStudySession.HandleAsync(
            NewRequest("learn-1") with { Mode = "learn" }, StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);

        result.Value.Session.Mode.Should().Be("learn");
        DbContext.StudySessions.Single().Mode.Should().Be("learn");
        RecordStudySession.ToDto(DbContext.StudySessions.Single()).Mode.Should().Be("learn");
    }

    [Theory]
    [InlineData("quiz", true)]
    [InlineData("learn", true)]
    [InlineData(null, true)]
    [InlineData("flashcards", false)]
    [InlineData("", false)]
    [InlineData("LEARN", false)]
    public void Validator_ValidatesMode(string? mode, bool valid)
    {
        new RecordStudySession.Validator().Validate(NewRequest() with { Mode = mode }).IsValid.Should().Be(valid);
    }

    [Fact]
    public async Task Record_RetryWithSameRunId_IsIdempotent()
    {
        RecordStudySession.Request request = NewRequest();
        await RecordStudySession.HandleAsync(request, StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);

        Result<RecordStudySession.Response> retry = await RecordStudySession.HandleAsync(
            request with { Correct = 1 }, StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);

        retry.Value.Created.Should().BeFalse();
        retry.Value.Session.Correct.Should().Be(7, "the first stored result wins");
        DbContext.StudySessions.Count().Should().Be(1);
    }

    [Fact]
    public async Task Record_SameRunIdForDifferentUsers_StoresBoth()
    {
        RecordStudySession.Request request = NewRequest();
        await RecordStudySession.HandleAsync(request, StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);
        Result<RecordStudySession.Response> other = await RecordStudySession.HandleAsync(
            request, StudySessionOrigins.Quiz, DbContext, "user-b", CancellationToken.None);

        other.Value.Created.Should().BeTrue();
        DbContext.StudySessions.Count().Should().Be(2);
    }

    [Fact]
    public async Task Record_ExpiredSessionsOfSameUser_ArePruned()
    {
        DbContext.StudySessions.Add(new StudySession
        {
            Id = Guid.NewGuid(), UserId = "user-a", RunId = "old", CompletedAt = DateTime.UtcNow.AddDays(-400),
            Correct = 1, Total = 2, MissedItems = { new StudySessionMissedItem { ItemId = Guid.NewGuid() } },
        });
        await DbContext.SaveChangesAsync();

        await RecordStudySession.HandleAsync(NewRequest(), StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);

        DbContext.StudySessions.Select(s => s.RunId).ToList().Should().Equal("run-1");
        DbContext.StudySessionMissedItems.Count().Should().Be(2);
    }

    [Fact]
    public async Task List_ReturnsOnlyCurrentUsersSessionsNewestFirst()
    {
        await RecordStudySession.HandleAsync(
            NewRequest("a-old", completedAt: DateTime.UtcNow.AddDays(-2)), StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);
        await RecordStudySession.HandleAsync(
            NewRequest("a-new", completedAt: DateTime.UtcNow.AddDays(-1)), StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);
        await RecordStudySession.HandleAsync(NewRequest("b-1"), StudySessionOrigins.Quiz, DbContext, "user-b", CancellationToken.None);

        GetStudySessions.SessionsResponse response = await GetStudySessions.ListAsync(null, DbContext, "user-a", CancellationToken.None);

        response.Sessions.Select(s => s.RunId).Should().Equal("a-new", "a-old");
    }

    [Fact]
    public async Task Summary_AggregatesTotalsRecentWindowAndImports()
    {
        await RecordStudySession.HandleAsync(
            NewRequest("r1", 8, 10), StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);
        await RecordStudySession.HandleAsync(
            NewRequest("r2", 2, 10, completedAt: DateTime.UtcNow.AddDays(-60)), StudySessionOrigins.GuestImport, DbContext, "user-a", CancellationToken.None);

        GetStudySessions.SummaryResponse summary = await GetStudySessions.SummarizeAsync(DbContext, "user-a", CancellationToken.None);

        summary.TotalSessions.Should().Be(2);
        summary.AccuracyPercent.Should().Be(50);
        summary.Last30DaysSessions.Should().Be(1);
        summary.Last30DaysAccuracyPercent.Should().Be(80);
        summary.ImportedSessions.Should().Be(1);

        GetStudySessions.SummaryResponse empty = await GetStudySessions.SummarizeAsync(DbContext, "nobody", CancellationToken.None);
        empty.AccuracyPercent.Should().BeNull();
    }

    [Theory]
    [InlineData("", 5, 10, 0)]
    [InlineData("bad id!", 5, 10, 0)]
    [InlineData("ok", 11, 10, 0)]
    [InlineData("ok", 5, 0, 0)]
    [InlineData("ok", 5, 10, 6)]
    public void Validator_RejectsInvalidRequests(string runId, int correct, int total, int missedCount)
    {
        RecordStudySession.Request request = NewRequest(
            runId, correct, total, Enumerable.Range(0, missedCount).Select(_ => Guid.NewGuid()).ToList());

        new RecordStudySession.Validator().Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validator_RejectsFutureTimestampAndDuplicateMissedItems()
    {
        var validator = new RecordStudySession.Validator();
        validator.Validate(NewRequest(completedAt: DateTime.UtcNow.AddHours(2))).IsValid.Should().BeFalse();
        Guid id = Guid.NewGuid();
        validator.Validate(NewRequest(missed: new List<Guid> { id, id })).IsValid.Should().BeFalse();
        validator.Validate(NewRequest()).IsValid.Should().BeTrue();
    }
}
