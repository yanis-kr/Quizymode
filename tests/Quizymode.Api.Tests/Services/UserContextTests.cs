using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class UserContextTests
{
    private static readonly IConfiguration DefaultConfig = new ConfigurationBuilder().Build();

    private static IConfiguration ConfigWith(string? value) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { [AdminGroups.ConfigKey] = value })
            .Build();

    private static UserContext ContextWithGroups(IConfiguration configuration, params string[] groups)
    {
        DefaultHttpContext httpContext = new();
        httpContext.User = new ClaimsPrincipal(
            new ClaimsIdentity(groups.Select(g => new Claim("cognito:groups", g)), "test"));
        return new UserContext(CreateAccessor(httpContext), NullLogger<UserContext>.Instance, configuration);
    }

    private static HttpContextAccessor CreateAccessor(HttpContext? httpContext = null)
    {
        return new HttpContextAccessor
        {
            HttpContext = httpContext
        };
    }

    [Fact]
    public void IsAuthenticated_ReturnsFalse_WhenHttpContextIsMissing()
    {
        IUserContext userContext = new UserContext(
            CreateAccessor(),
            NullLogger<UserContext>.Instance,
            DefaultConfig);

        userContext.IsAuthenticated.Should().BeFalse();
    }

    [Fact]
    public void IsAuthenticated_ReturnsTrue_ForAuthenticatedPrincipal()
    {
        DefaultHttpContext httpContext = new();
        httpContext.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim("sub", "subject-1")], "test"));

        IUserContext userContext = new UserContext(
            CreateAccessor(httpContext),
            NullLogger<UserContext>.Instance,
            DefaultConfig);

        userContext.IsAuthenticated.Should().BeTrue();
    }

    [Fact]
    public void UserId_ReturnsNull_WhenHttpContextIsMissing()
    {
        IUserContext userContext = new UserContext(
            CreateAccessor(),
            NullLogger<UserContext>.Instance,
            DefaultConfig);

        userContext.UserId.Should().BeNull();
    }

    [Fact]
    public void UserId_ReturnsValue_FromHttpContextItems()
    {
        DefaultHttpContext httpContext = new();
        httpContext.Items["UserId"] = "user-123";

        IUserContext userContext = new UserContext(
            CreateAccessor(httpContext),
            NullLogger<UserContext>.Instance,
            DefaultConfig);

        userContext.UserId.Should().Be("user-123");
    }

    [Fact]
    public void UserId_ReturnsNull_WhenAuthenticatedUserLacksStoredItem()
    {
        DefaultHttpContext httpContext = new();
        httpContext.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim("sub", "subject-1")], "test"));

        IUserContext userContext = new UserContext(
            CreateAccessor(httpContext),
            NullLogger<UserContext>.Instance,
            DefaultConfig);

        userContext.UserId.Should().BeNull();
    }

    [Fact]
    public void IsAdmin_AC_4_1_4_ReturnsTrue_ForAdminsGroup()
    {
        ContextWithGroups(DefaultConfig, "Admins").IsAdmin.Should().BeTrue();
    }

    [Fact]
    public void IsAdmin_AC_4_1_4_ReturnsTrue_ForMultiGroupUserIncludingAdmins()
    {
        ContextWithGroups(DefaultConfig, "reader", "Admins", "us-east-1_LiJbvT212_Google").IsAdmin.Should().BeTrue();
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("admins")]
    [InlineData("ADMINS")]
    [InlineData("Admin")]
    [InlineData("Administrators")]
    [InlineData("AdminsX")]
    [InlineData("AdminSuper")]
    [InlineData("us-east-1_LiJbvT212_Google")]
    [InlineData("reader")]
    public void IsAdmin_AC_4_1_4_ReturnsFalse_ForNonAllowlistedGroups(string group)
    {
        ContextWithGroups(DefaultConfig, "reader", group).IsAdmin.Should().BeFalse();
    }

    [Fact]
    public void IsAdmin_AC_4_1_4_ReturnsFalse_WhenNoGroupsClaim()
    {
        ContextWithGroups(DefaultConfig).IsAdmin.Should().BeFalse();
    }

    [Fact]
    public void IsAdmin_AC_4_1_4_ReturnsFalse_WhenHttpContextIsMissing()
    {
        IUserContext userContext = new UserContext(CreateAccessor(), NullLogger<UserContext>.Instance, DefaultConfig);

        userContext.IsAdmin.Should().BeFalse();
    }

    [Fact]
    public void IsAdmin_AC_4_1_4_UsesConfiguredAllowlist_CaseSensitively()
    {
        IConfiguration configuration = ConfigWith("Owners, Admins");

        ContextWithGroups(configuration, "Owners").IsAdmin.Should().BeTrue();
        ContextWithGroups(configuration, "owners").IsAdmin.Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData(" , ")]
    public void IsAdmin_AC_4_1_4_FailsClosed_WhenAllowlistConfiguredEmpty(string configured)
    {
        ContextWithGroups(ConfigWith(configured), "Admins", "admin").IsAdmin.Should().BeFalse();
    }
}
