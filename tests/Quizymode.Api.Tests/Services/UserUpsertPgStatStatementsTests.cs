using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using Xunit.Abstractions;

namespace Quizymode.Api.Tests.Services;

/// <summary>
/// #328 evidence from the server's own statistics: steady-state authenticated requests must issue zero
/// <c>FOR UPDATE</c> statements, while forced-stale requests (the control) issue one each. Needs Docker; fails
/// rather than skips when the container or the extension is unavailable.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class UserUpsertPgStatStatementsTests(PgStatStatementsContainerFixture fixture, ITestOutputHelper output)
    : IClassFixture<PgStatStatementsContainerFixture>
{
    private const int SteadyRequests = 20;
    private const int ControlRequests = 5;

    [Fact]
    public async Task SteadyStateRequests_IssueNoForUpdateStatements_WhileStaleControlDoes()
    {
        (await fixture.ShowAsync("shared_preload_libraries")).Should().Contain("pg_stat_statements");
        (await fixture.ShowAsync("fsync")).Should().Be("off", "the Testcontainers default command must be kept when appending the preload flag");

        string subject = Guid.NewGuid().ToString();
        string email = $"{Guid.NewGuid():N}@example.com";
        User seeded = new()
        {
            Id = Guid.NewGuid(),
            Subject = subject,
            Email = email,
            Name = $"custom-{Guid.NewGuid()}",
            LastLogin = DateTime.UtcNow.AddMinutes(-1),
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };
        await using (ApplicationDbContext seedDb = fixture.CreateDbContext())
        {
            seedDb.Users.Add(seeded);
            await seedDb.SaveChangesAsync();
        }

        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            () => fixture.CreateDbContext(),
            _ => { },
            app => app.MapGet("/test/whoami", (IUserContext userContext) => Results.Ok(new { userId = userContext.UserId }))
                .RequireAuthorization(),
            useUserUpsertMiddleware: true);

        async Task SendAsync()
        {
            string token = host.CreateToken(subject, email, emailVerified: true);
            using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/test/whoami", token);
            using HttpResponseMessage response = await host.Client.SendAsync(request);
            response.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
            (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("userId").GetString()
                .Should().Be(seeded.Id.ToString());
        }

        await fixture.ResetStatementStatsAsync();
        for (int i = 0; i < SteadyRequests; i++)
        {
            await SendAsync();
        }

        long steady = await fixture.StatementCallsAsync("FOR UPDATE");

        await fixture.ResetStatementStatsAsync();
        for (int i = 0; i < ControlRequests; i++)
        {
            await using (ApplicationDbContext staleDb = fixture.CreateDbContext())
            {
                await staleDb.Users.Where(u => u.Id == seeded.Id)
                    .ExecuteUpdateAsync(set => set.SetProperty(u => u.LastLogin, DateTime.UtcNow.AddMinutes(-7)));
            }

            await SendAsync();
        }

        long control = await fixture.StatementCallsAsync("FOR UPDATE");

        output.WriteLine($"pg_stat_statements FOR UPDATE calls, steady ({SteadyRequests} unchanged recent requests): {steady}");
        output.WriteLine($"pg_stat_statements FOR UPDATE calls, control ({ControlRequests} forced-stale requests): {control}");

        steady.Should().Be(0);
        control.Should().Be(ControlRequests);
    }
}
