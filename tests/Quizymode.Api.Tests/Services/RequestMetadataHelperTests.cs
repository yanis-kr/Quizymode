using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class RequestMetadataHelperTests
{
    [Fact]
    public void GetClientIpAddress_ReturnsUnknown_WhenContextIsNull()
    {
        RequestMetadataHelper.GetClientIpAddress(null).Should().Be("unknown");
    }

    [Fact]
    public void GetClientIpAddress_PrefersFirstForwardedForAddress()
    {
        DefaultHttpContext httpContext = new();
        httpContext.Request.Headers["X-Forwarded-For"] = "203.0.113.5, 203.0.113.6";
        httpContext.Request.Headers["X-Real-IP"] = "198.51.100.9";
        httpContext.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.10");

        RequestMetadataHelper.GetClientIpAddress(httpContext).Should().Be("203.0.113.5");
    }

    [Fact]
    public void GetClientIpAddress_FallsBackToRealIpHeader()
    {
        DefaultHttpContext httpContext = new();
        httpContext.Request.Headers["X-Real-IP"] = "198.51.100.9";
        httpContext.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.10");

        RequestMetadataHelper.GetClientIpAddress(httpContext).Should().Be("198.51.100.9");
    }

    [Fact]
    public void GetClientIpAddress_FallsBackToRemoteIpAddress()
    {
        DefaultHttpContext httpContext = new();
        httpContext.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.10");

        RequestMetadataHelper.GetClientIpAddress(httpContext).Should().Be("192.0.2.10");
    }
}
