using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Quizymode.Api.Services;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>
/// AC 4.1.4 (#809): the real "Admin" policy and <see cref="IUserContext.IsAdmin"/> admit only a
/// <c>cognito:groups</c> value exactly equal (case-sensitive) to an allowlisted name (default <c>Admins</c>); an empty
/// allowlist fails closed. Asserts real HTTP status codes.
/// </summary>
public sealed class AdminPolicyAllowlistHttpTests : DatabaseTestFixture
{
    private static void MapProbes(IEndpointRouteBuilder app)
    {
        app.MapGet("/probe/admin", () => Results.Ok("ok")).RequireAuthorization("Admin");
        app.MapGet("/probe/is-admin", (IUserContext user) => Results.Ok(user.IsAdmin)).RequireAuthorization();
    }

    private async Task<(HttpStatusCode PolicyStatus, bool? IsAdmin)> ProbeAsync(
        IReadOnlyDictionary<string, string?>? configuration,
        params string[] groups)
    {
        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            CreateDbContext, _ => { }, MapProbes, extraConfiguration: configuration);
        string token = host.CreateToken("subject-1", "user@example.com", groups);

        using HttpRequestMessage policyRequest = JwtHttpTestHost.Request(HttpMethod.Get, "/probe/admin", token);
        using HttpResponseMessage policyResponse = await host.Client.SendAsync(policyRequest);

        using HttpRequestMessage contextRequest = JwtHttpTestHost.Request(HttpMethod.Get, "/probe/is-admin", token);
        using HttpResponseMessage contextResponse = await host.Client.SendAsync(contextRequest);
        bool? isAdmin = contextResponse.StatusCode == HttpStatusCode.OK
            ? (await contextResponse.Content.ReadAsStringAsync()) == "true"
            : null;

        return (policyResponse.StatusCode, isAdmin);
    }

    [Fact]
    public async Task AdminPolicy_AC_4_1_4_AdmitsAdminsGroup()
    {
        (HttpStatusCode status, bool? isAdmin) = await ProbeAsync(null, "Admins");

        status.Should().Be(HttpStatusCode.OK);
        isAdmin.Should().BeTrue();
    }

    [Fact]
    public async Task AdminPolicy_AC_4_1_4_AdmitsMultiGroupUserIncludingAdmins()
    {
        (HttpStatusCode status, bool? isAdmin) = await ProbeAsync(null, "us-east-1_LiJbvT212_Google", "Admins");

        status.Should().Be(HttpStatusCode.OK);
        isAdmin.Should().BeTrue();
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("admins")]
    [InlineData("ADMINS")]
    [InlineData("Administrators")]
    [InlineData("AdminsX")]
    [InlineData("us-east-1_LiJbvT212_Google")]
    public async Task AdminPolicy_AC_4_1_4_Returns403_ForNonAllowlistedGroup(string group)
    {
        (HttpStatusCode status, bool? isAdmin) = await ProbeAsync(null, group);

        status.Should().Be(HttpStatusCode.Forbidden);
        isAdmin.Should().BeFalse();
    }

    [Fact]
    public async Task AdminPolicy_AC_4_1_4_Returns403_WhenUserHasNoGroups()
    {
        (HttpStatusCode status, bool? isAdmin) = await ProbeAsync(null);

        status.Should().Be(HttpStatusCode.Forbidden);
        isAdmin.Should().BeFalse();
    }

    [Fact]
    public async Task AdminPolicy_AC_4_1_4_UsesConfiguredAllowlist()
    {
        Dictionary<string, string?> configuration = new() { ["Authentication:AdminGroups"] = "Owners" };

        (await ProbeAsync(configuration, "Owners")).Should().Be((HttpStatusCode.OK, true));
        (await ProbeAsync(configuration, "Admins")).Should().Be((HttpStatusCode.Forbidden, false));
    }

    [Fact]
    public async Task AdminPolicy_AC_4_1_4_FailsClosed_WhenAllowlistConfiguredEmpty()
    {
        Dictionary<string, string?> configuration = new() { ["Authentication:AdminGroups"] = "" };

        (HttpStatusCode status, bool? isAdmin) = await ProbeAsync(configuration, "Admins", "admin");

        status.Should().Be(HttpStatusCode.Forbidden);
        isAdmin.Should().BeFalse();
    }
}
