using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

// AC 16.3.3: rate-limit partitions key on the trusted client IP, so a rotated X-Forwarded-For buys no extra budget.
public sealed class ForwardedIpPartitionTests
{
    [Fact]
    public void AnonymousPartition_IgnoresClientSentForwardedFor()
    {
        DefaultHttpContext first = new();
        first.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.10");
        first.Request.Headers["X-Forwarded-For"] = "203.0.113.7";

        DefaultHttpContext second = new();
        second.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.10");
        second.Request.Headers["X-Forwarded-For"] = "203.0.113.99";

        string a = Quizymode.Api.StartupExtensions.StartupExtensions.GetAuthenticatedOrTrustedIpPartitionKey(first);
        string b = Quizymode.Api.StartupExtensions.StartupExtensions.GetAuthenticatedOrTrustedIpPartitionKey(second);

        a.Should().Be(b);
        a.Should().NotContain("203.0.113");
    }

    [Fact]
    public void AnonymousPartition_DiffersForDifferentRemoteAddresses()
    {
        DefaultHttpContext first = new();
        first.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.10");
        DefaultHttpContext second = new();
        second.Connection.RemoteIpAddress = IPAddress.Parse("198.51.100.4");

        Quizymode.Api.StartupExtensions.StartupExtensions.GetAuthenticatedOrTrustedIpPartitionKey(first)
            .Should().NotBe(Quizymode.Api.StartupExtensions.StartupExtensions.GetAuthenticatedOrTrustedIpPartitionKey(second));
    }

    [Theory]
    [InlineData("2001:db8:1:2::1", "2001:db8:1:2:ffff:ffff:ffff:ffff", true)]
    [InlineData("2001:db8:1:2::1", "2001:db8:1:3::1", false)]
    [InlineData("::ffff:192.0.2.10", "192.0.2.10", true)]
    [InlineData("::ffff:192.0.2.10", "::ffff:192.0.2.11", false)]
    public void AnonymousPartition_GroupsIpv6ByItsSlash64(string firstAddress, string secondAddress, bool shared)
    {
        string first = KeyFor(firstAddress);
        string second = KeyFor(secondAddress);

        (first == second).Should().Be(shared, $"{first} and {second}");
    }

    private static string KeyFor(string address)
    {
        DefaultHttpContext context = new();
        context.Connection.RemoteIpAddress = IPAddress.Parse(address);
        return Quizymode.Api.StartupExtensions.StartupExtensions.GetAuthenticatedOrTrustedIpPartitionKey(context);
    }
}
