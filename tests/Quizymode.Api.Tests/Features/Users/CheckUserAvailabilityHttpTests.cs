using System.Net;
using FluentAssertions;
using Quizymode.Api.Features.Users;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Users;

/// <summary>The anonymous availability check answers about display names only, and a limited number of times.</summary>
public sealed class CheckUserAvailabilityHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        DbContext.Users.AddRange(
            new User { Id = Guid.NewGuid(), Subject = "s1", Name = "TakenName", Email = "registered@example.com" },
            new User { Id = Guid.NewGuid(), Subject = "s2", Name = "named@example.com", Email = "named@example.com" });
        await DbContext.SaveChangesAsync();

        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            _ => { },
            app => new CheckUserAvailability.Endpoint().MapEndpoint(app),
            useRateLimiting: true);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<(HttpStatusCode Status, string Body)> GetAsync(string query)
    {
        using HttpResponseMessage response = await _host.Client.GetAsync("/users/availability" + query);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("takenname", false)]
    [InlineData("%20TAKENNAME%20", false)]
    [InlineData("FreeName", true)]
    public async Task AC_4_2_12_DisplayName_IsCheckedIgnoringCaseAndSpaces(string name, bool available)
    {
        (HttpStatusCode status, string body) = await GetAsync($"?username={name}");

        status.Should().Be(HttpStatusCode.OK);
        body.Should().Contain($"\"isUsernameAvailable\":{(available ? "true" : "false")}");
    }

    [Theory]
    [InlineData("registered@example.com", "unknown@example.com")]
    [InlineData("named@example.com", "unknown@example.com")]
    public async Task AC_4_2_12_RegisteredAndUnknownEmails_GetTheSameAnswer(string registered, string unknown)
    {
        foreach (string query in new[] { "?username=FreeName&email={0}", "?username={0}", "?email={0}" })
        {
            (HttpStatusCode Status, string Body) known = await GetAsync(string.Format(query, Uri.EscapeDataString(registered)));
            (HttpStatusCode Status, string Body) other = await GetAsync(string.Format(query, Uri.EscapeDataString(unknown)));

            known.Should().Be(other, "the query {0} must not tell the two apart", query);
            known.Body.Should().NotContainEquivalentOf("email");
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData("?username=%20%20")]
    [InlineData("?email=registered%40example.com")]
    public async Task AC_4_2_12_WithoutUsername_Returns400(string query)
    {
        (await GetAsync(query)).Status.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AC_4_2_13_ThirtyFirstCheckInTenMinutes_Returns429WithRetryAfter()
    {
        for (int i = 0; i < 30; i++)
        {
            (await GetAsync($"?username=name{i}")).Status.Should().Be(HttpStatusCode.OK);
        }

        using HttpResponseMessage rejected = await _host.Client.GetAsync("/users/availability?username=onemore");

        rejected.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        rejected.Headers.RetryAfter.Should().NotBeNull();
        (await rejected.Content.ReadAsStringAsync()).Should().Contain("Too many display name checks");
    }
}
