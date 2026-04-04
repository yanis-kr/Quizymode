using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class UserContextTests
{
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
            NullLogger<UserContext>.Instance);

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
            NullLogger<UserContext>.Instance);

        userContext.IsAuthenticated.Should().BeTrue();
    }

    [Fact]
    public void UserId_ReturnsNull_WhenHttpContextIsMissing()
    {
        IUserContext userContext = new UserContext(
            CreateAccessor(),
            NullLogger<UserContext>.Instance);

        userContext.UserId.Should().BeNull();
    }

    [Fact]
    public void UserId_ReturnsValue_FromHttpContextItems()
    {
        DefaultHttpContext httpContext = new();
        httpContext.Items["UserId"] = "user-123";

        IUserContext userContext = new UserContext(
            CreateAccessor(httpContext),
            NullLogger<UserContext>.Instance);

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
            NullLogger<UserContext>.Instance);

        userContext.UserId.Should().BeNull();
    }

    [Fact]
    public void IsAdmin_ReturnsTrue_WhenAnyCognitoGroupStartsWithAdmin()
    {
        DefaultHttpContext httpContext = new();
        httpContext.User = new ClaimsPrincipal(
            new ClaimsIdentity(
            [
                new Claim("cognito:groups", "reader"),
                new Claim("cognito:groups", "AdminSuper")
            ],
            "test"));

        IUserContext userContext = new UserContext(
            CreateAccessor(httpContext),
            NullLogger<UserContext>.Instance);

        userContext.IsAdmin.Should().BeTrue();
    }

    [Fact]
    public void IsAdmin_ReturnsFalse_WhenNoAdminGroupExists()
    {
        DefaultHttpContext httpContext = new();
        httpContext.User = new ClaimsPrincipal(
            new ClaimsIdentity(
            [
                new Claim("cognito:groups", "reader"),
                new Claim("cognito:groups", "author")
            ],
            "test"));

        IUserContext userContext = new UserContext(
            CreateAccessor(httpContext),
            NullLogger<UserContext>.Instance);

        userContext.IsAdmin.Should().BeFalse();
    }
}
