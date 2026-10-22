using FluentAssertions;
using Quizymode.Api.Features.StudySessions;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudySessions;

public sealed class ImportGuestStudySessionsTests : DatabaseTestFixture
{
    private static readonly RecordStudySession.Validator RunValidator = new();

    private static RecordStudySession.Request Run(string runId, int correct = 3, int total = 4, int daysAgo = 5) =>
        new(runId, DateTime.UtcNow.AddDays(-daysAgo), correct, total,
            new RecordStudySession.SourceDto("global", null, null, new List<string>(), new List<string> { "math" }),
            new List<Guid> { Guid.NewGuid() });

    [Fact]
    public async Task Import_StoresRunsAsGuestImportOrigin()
    {
        ImportGuestStudySessions.Request request = new(1, new List<RecordStudySession.Request> { Run("g1"), Run("g2") });

        Result<ImportGuestStudySessions.Response> result = await ImportGuestStudySessions.HandleAsync(
            request, RunValidator, DbContext, "user-a", CancellationToken.None);

        result.Value.Imported.Should().Be(2);
        result.Value.Duplicates.Should().Be(0);
        DbContext.StudySessions.Select(s => s.Origin).Distinct().ToList().Should().Equal(StudySessionOrigins.GuestImport);
    }

    [Fact]
    public async Task Import_AcceptsModeAndDefaultsMissingModeToQuiz()
    {
        ImportGuestStudySessions.Request request = new(1, new List<RecordStudySession.Request>
        {
            Run("g-learn") with { Mode = "learn" },
            Run("g-old"),
            Run("g-bad") with { Mode = "bogus" },
        });

        Result<ImportGuestStudySessions.Response> result = await ImportGuestStudySessions.HandleAsync(
            request, RunValidator, DbContext, "user-a", CancellationToken.None);

        result.Value.Imported.Should().Be(2);
        result.Value.RejectedRunIds.Should().Equal("g-bad");
        DbContext.StudySessions.Single(s => s.RunId == "g-learn").Mode.Should().Be("learn");
        DbContext.StudySessions.Single(s => s.RunId == "g-old").Mode.Should().Be("quiz");
    }

    [Fact]
    public async Task Import_Retry_IsIdempotentAndKeepsFirstScore()
    {
        ImportGuestStudySessions.Request request = new(1, new List<RecordStudySession.Request> { Run("g1") });
        await ImportGuestStudySessions.HandleAsync(request, RunValidator, DbContext, "user-a", CancellationToken.None);

        ImportGuestStudySessions.Request changed = new(1, new List<RecordStudySession.Request> { Run("g1", correct: 0) });
        Result<ImportGuestStudySessions.Response> retry = await ImportGuestStudySessions.HandleAsync(
            changed, RunValidator, DbContext, "user-a", CancellationToken.None);

        retry.Value.Imported.Should().Be(0);
        retry.Value.Duplicates.Should().Be(1);
        DbContext.StudySessions.Single().Correct.Should().Be(3);
    }

    [Fact]
    public async Task Import_AlreadySavedLiveRun_IsDuplicateNotOverwritten()
    {
        await RecordStudySession.HandleAsync(Run("same"), StudySessionOrigins.Quiz, DbContext, "user-a", CancellationToken.None);

        Result<ImportGuestStudySessions.Response> result = await ImportGuestStudySessions.HandleAsync(
            new(1, new List<RecordStudySession.Request> { Run("same") }), RunValidator, DbContext, "user-a", CancellationToken.None);

        result.Value.Duplicates.Should().Be(1);
        DbContext.StudySessions.Single().Origin.Should().Be(StudySessionOrigins.Quiz);
    }

    [Fact]
    public async Task Import_InvalidRunsAreRejectedWithoutBlockingValidOnes()
    {
        ImportGuestStudySessions.Request request = new(1, new List<RecordStudySession.Request>
        {
            Run("ok"), Run("bad", correct: 9, total: 4), Run("ok"),
        });

        Result<ImportGuestStudySessions.Response> result = await ImportGuestStudySessions.HandleAsync(
            request, RunValidator, DbContext, "user-a", CancellationToken.None);

        result.Value.Imported.Should().Be(1);
        result.Value.Duplicates.Should().Be(1);
        result.Value.RejectedRunIds.Should().Equal("bad");
    }

    [Fact]
    public void Validator_RequiresSupportedVersionAndBoundedRuns()
    {
        var validator = new ImportGuestStudySessions.Validator();
        validator.Validate(new ImportGuestStudySessions.Request(1, new List<RecordStudySession.Request> { Run("a") })).IsValid.Should().BeTrue();
        validator.Validate(new ImportGuestStudySessions.Request(2, new List<RecordStudySession.Request> { Run("a") })).IsValid.Should().BeFalse();
        validator.Validate(new ImportGuestStudySessions.Request(1, new List<RecordStudySession.Request>())).IsValid.Should().BeFalse();
        validator.Validate(new ImportGuestStudySessions.Request(1, null)).IsValid.Should().BeFalse();
        validator.Validate(new ImportGuestStudySessions.Request(1, Enumerable.Range(0, 51).Select(i => Run($"r{i}")).ToList())).IsValid.Should().BeFalse();
    }
}
