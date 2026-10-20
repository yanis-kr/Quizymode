using System.Net.Http.Json;
using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Quizymode.Api.Services;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>
/// AUTH-003 (#118): the email_verified guard used by UserUpsertMiddleware before it re-points a Users row
/// to a different Subject. The claim is read through the real JWT bearer pipeline so the test observes the
/// claim shape that Cognito tokens actually produce after validation.
/// </summary>
public sealed class EmailVerifiedGuardTests : DatabaseTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            _ => { },
            app => app.MapGet("/probe/email-verified", (HttpContext context) =>
                    Results.Ok(UserUpsertMiddleware.IsEmailVerified(context.User)))
                .RequireAuthorization());
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<bool> ProbeAsync(object? emailVerified)
    {
        string token = _host.CreateToken("sub-1", "user@example.com", emailVerified: emailVerified);
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/probe/email-verified", token);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<bool>();
    }

    [Fact]
    public async Task IsEmailVerified_JsonBooleanTrue_ReturnsTrue() => (await ProbeAsync(true)).Should().BeTrue();

    [Fact]
    public async Task IsEmailVerified_StringTrue_ReturnsTrue() => (await ProbeAsync("true")).Should().BeTrue();

    [Fact]
    public async Task IsEmailVerified_StringTrueMixedCase_ReturnsTrue() => (await ProbeAsync("True")).Should().BeTrue();

    [Fact]
    public async Task IsEmailVerified_JsonBooleanFalse_ReturnsFalse() => (await ProbeAsync(false)).Should().BeFalse();

    [Fact]
    public async Task IsEmailVerified_StringOne_ReturnsFalse() => (await ProbeAsync("1")).Should().BeFalse();

    [Fact]
    public async Task IsEmailVerified_ClaimAbsent_ReturnsFalse() => (await ProbeAsync(null)).Should().BeFalse();

    [Fact]
    public void IsEmailVerified_PrincipalWithoutClaim_ReturnsFalse()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", "x")], "test"));
        UserUpsertMiddleware.IsEmailVerified(principal).Should().BeFalse();
    }

    [Theory]
    [InlineData("sub-a", "sub-a", false, "UseExisting")]
    [InlineData("sub-a", "sub-a", true, "UseExisting")]
    [InlineData("sub-a", "sub-b", true, "Relink")]
    [InlineData("sub-a", "sub-b", false, "Reject")]
    public void DecideEmailMatch_CoversSameAndDifferentSubjects(
        string subject,
        string existingSubject,
        bool emailVerified,
        string expected)
    {
        UserUpsertMiddleware.DecideEmailMatch(subject, existingSubject, emailVerified).ToString().Should().Be(expected);
    }
}
