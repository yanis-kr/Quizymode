using System.Security.Claims;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>AC 4.1.4 (#809): explicit, case-sensitive Cognito admin group allowlist that fails closed.</summary>
public sealed class AdminGroupsTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.ToDictionary(v => v.Key, v => v.Value))
            .Build();

    private static ClaimsPrincipal Principal(params string[] groups) =>
        new(new ClaimsIdentity(groups.Select(g => new Claim("cognito:groups", g)), "test"));

    [Fact]
    public void Resolve_AC_4_1_4_DefaultsToAdmins_WhenUnset()
    {
        AdminGroups.Resolve(Config()).Should().Equal("Admins");
    }

    [Fact]
    public void Resolve_AC_4_1_4_ReadsListConfiguration()
    {
        AdminGroups.Resolve(Config(("Authentication:AdminGroups:0", "Admins"), ("Authentication:AdminGroups:1", "Owners")))
            .Should().Equal("Admins", "Owners");
    }

    [Fact]
    public void Resolve_AC_4_1_4_ReadsCommaSeparatedValue()
    {
        AdminGroups.Resolve(Config(("Authentication:AdminGroups", " Admins , Owners ,")))
            .Should().Equal("Admins", "Owners");
    }

    [Fact]
    public void Resolve_AC_4_1_4_ReturnsEmpty_WhenConfiguredEmpty()
    {
        AdminGroups.Resolve(Config(("Authentication:AdminGroups", ""))).Should().BeEmpty();
    }

    [Theory]
    [InlineData("Admins", true)]
    [InlineData("admin", false)]
    [InlineData("admins", false)]
    [InlineData("Administrators", false)]
    [InlineData("AdminsX", false)]
    [InlineData("us-east-1_LiJbvT212_Google", false)]
    public void IsAdmin_AC_4_1_4_MatchesExactCaseSensitiveNamesOnly(string group, bool expected)
    {
        AdminGroups.IsAdmin(Principal(group), ["Admins"]).Should().Be(expected);
    }

    [Fact]
    public void IsAdmin_AC_4_1_4_FailsClosed_ForEmptyAllowlistOrNullUser()
    {
        AdminGroups.IsAdmin(Principal("Admins"), []).Should().BeFalse();
        AdminGroups.IsAdmin(null, ["Admins"]).Should().BeFalse();
    }
}
