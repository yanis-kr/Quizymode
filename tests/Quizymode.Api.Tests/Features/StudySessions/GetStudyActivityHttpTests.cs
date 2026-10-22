using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.StudySessions;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudySessions;

/// <summary>Over real HTTP: authentication is required, days is bounded, and only the caller's days come back.</summary>
public sealed class GetStudyActivityHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            _ => { },
            app => new GetStudyActivity.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<HttpResponseMessage> GetAsync(string path, string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, path, token);
        return await _host.Client.SendAsync(request);
    }

    [Fact]
    public async Task Activity_RequiresAuthentication()
    {
        using HttpResponseMessage response = await GetAsync("/study-sessions/activity", null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(366)]
    [InlineData(-1)]
    public async Task Activity_OutOfRangeDays_Returns400(int days)
    {
        using HttpResponseMessage response = await GetAsync($"/study-sessions/activity?days={days}", _host.CreateToken("member", "member@example.com"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Activity_ReturnsOnlyTheCallersDays()
    {
        string tokenA = _host.CreateToken("member-a", "a@example.com");
        string tokenB = _host.CreateToken("member-b", "b@example.com");
        // First call creates both Users rows so their ids can own seeded sessions.
        (await GetAsync("/study-sessions/activity", tokenA)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await GetAsync("/study-sessions/activity", tokenB)).StatusCode.Should().Be(HttpStatusCode.OK);

        await using ApplicationDbContext db = CreateDbContext();
        string idA = (await db.Users.SingleAsync(u => u.Subject == "member-a")).Id.ToString();
        string idB = (await db.Users.SingleAsync(u => u.Subject == "member-b")).Id.ToString();
        DateTime stamp = DateTime.UtcNow.AddMinutes(-5);
        foreach ((string owner, int count) in new[] { (idA, 2), (idB, 5) })
        {
            for (int i = 0; i < count; i++)
            {
                db.StudySessions.Add(new StudySession
                {
                    Id = Guid.NewGuid(), UserId = owner, RunId = $"{owner}-{i}", Origin = "quiz", Mode = "quiz",
                    CompletedAt = stamp, CreatedAt = stamp, Correct = 1, Total = 2,
                });
            }
        }
        await db.SaveChangesAsync();

        using HttpResponseMessage response = await GetAsync("/study-sessions/activity?days=7", tokenA);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        GetStudyActivity.Response? body = await response.Content.ReadFromJsonAsync<GetStudyActivity.Response>();
        body!.Days.Should().Be(7);
        body.Activity.Should().ContainSingle().Which.Sessions.Should().Be(2);
        body.CurrentStreak.Should().Be(1);
    }
}
