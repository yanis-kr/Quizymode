using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Quizymode.Api.Features.StudySessions;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudySessions;

public sealed class GetStudyActivityTests : DatabaseTestFixture
{
    private static readonly DateTime Now = new(2026, 10, 22, 15, 0, 0, DateTimeKind.Utc);
    private static readonly DateOnly Today = new(2026, 10, 22);

    private void AddSession(string userId, DateTime completedAt, int correct = 3, int total = 5, string mode = "quiz", string origin = "quiz")
    {
        DbContext.StudySessions.Add(new StudySession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            RunId = Guid.NewGuid().ToString("N"),
            Origin = origin,
            Mode = mode,
            CompletedAt = completedAt,
            CreatedAt = completedAt,
            Correct = correct,
            Total = total,
        });
    }

    [Fact]
    public async Task Get_GroupsSessionsByUtcDay()
    {
        AddSession("user-a", new DateTime(2026, 10, 21, 0, 0, 1, DateTimeKind.Utc), 2, 4);
        AddSession("user-a", new DateTime(2026, 10, 21, 23, 59, 59, DateTimeKind.Utc), 3, 5, mode: "learn");
        AddSession("user-a", new DateTime(2026, 10, 20, 23, 59, 59, DateTimeKind.Utc), 1, 1, origin: "guest-import");
        await DbContext.SaveChangesAsync();

        GetStudyActivity.Response result = await GetStudyActivity.GetAsync(182, Now, DbContext, "user-a", CancellationToken.None);

        result.Today.Should().Be("2026-10-22");
        result.Activity.Select(d => d.Date).Should().Equal("2026-10-20", "2026-10-21");
        GetStudyActivity.DayDto oct21 = result.Activity.Single(d => d.Date == "2026-10-21");
        oct21.Sessions.Should().Be(2);
        oct21.Questions.Should().Be(9);
        oct21.Correct.Should().Be(5);
        oct21.HasDaily.Should().BeFalse();
        result.Activity.Single(d => d.Date == "2026-10-20").Sessions.Should().Be(1);
    }

    [Fact]
    public async Task Get_OnlyReturnsCallersRows()
    {
        AddSession("user-a", Now.AddHours(-1));
        AddSession("user-b", Now.AddHours(-1));
        AddSession("user-b", Now.AddDays(-1));
        await DbContext.SaveChangesAsync();

        GetStudyActivity.Response result = await GetStudyActivity.GetAsync(182, Now, DbContext, "user-a", CancellationToken.None);

        result.Activity.Should().ContainSingle().Which.Sessions.Should().Be(1);
        result.CurrentStreak.Should().Be(1);
    }

    [Fact]
    public async Task Get_LimitsActivityToWindowButStreaksUseFullHistory()
    {
        for (int offset = 0; offset < 10; offset++)
        {
            AddSession("user-a", Now.AddDays(-offset));
        }
        await DbContext.SaveChangesAsync();

        GetStudyActivity.Response result = await GetStudyActivity.GetAsync(3, Now, DbContext, "user-a", CancellationToken.None);

        result.Activity.Select(d => d.Date).Should().Equal("2026-10-20", "2026-10-21", "2026-10-22");
        result.CurrentStreak.Should().Be(10);
        result.LongestStreak.Should().Be(10);
    }

    [Fact]
    public async Task Get_MarksDailyQuizDays()
    {
        AddSession("user-a", Now.AddDays(-1));
        DbContext.DailyQuizCompletions.Add(new DailyQuizCompletion { UserId = "user-a", Date = Today.AddDays(-1), Correct = 3, Total = 5 });
        DbContext.DailyQuizCompletions.Add(new DailyQuizCompletion { UserId = "user-b", Date = Today, Correct = 3, Total = 5 });
        await DbContext.SaveChangesAsync();

        GetStudyActivity.Response result = await GetStudyActivity.GetAsync(182, Now, DbContext, "user-a", CancellationToken.None);

        result.Activity.Should().ContainSingle().Which.HasDaily.Should().BeTrue();
    }

    [Theory]
    [InlineData(new int[] { }, 0, 0)]
    [InlineData(new[] { 0 }, 1, 1)]
    [InlineData(new[] { 1 }, 1, 1)]
    [InlineData(new[] { 2 }, 0, 1)]
    [InlineData(new[] { 0, 1, 2, 4, 5 }, 3, 3)]
    [InlineData(new[] { 1, 2, 3, 6, 7, 8, 9, 10 }, 3, 5)]
    public async Task Get_ComputesCurrentAndLongestStreak(int[] daysAgo, int current, int longest)
    {
        foreach (int offset in daysAgo)
        {
            AddSession("user-a", Now.AddDays(-offset));
        }
        await DbContext.SaveChangesAsync();

        GetStudyActivity.Response result = await GetStudyActivity.GetAsync(182, Now, DbContext, "user-a", CancellationToken.None);

        result.CurrentStreak.Should().Be(current);
        result.LongestStreak.Should().Be(longest);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(182, true)]
    [InlineData(365, true)]
    [InlineData(366, false)]
    [InlineData(-5, false)]
    public void Validator_EnforcesDaysBounds(int days, bool valid)
    {
        new GetStudyActivity.Validator().Validate(days).IsValid.Should().Be(valid);
    }
}
