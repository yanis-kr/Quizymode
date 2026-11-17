using System.Net;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>#752: client-supplied IP values are validated before any cache, outbound lookup or log write.</summary>
public sealed class IpGeolocationServiceTests
{
    private sealed class CountingHandler(string json) : HttpMessageHandler
    {
        public int Calls { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            });
        }
    }

    private sealed class SingleClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static (IpGeolocationService Service, CountingHandler Handler) Create(string json = """{"country":"US","region":"California","city":"Oakland"}""")
    {
        CountingHandler handler = new(json);
        IpGeolocationService service = new(new SingleClientFactory(handler), NullLogger<IpGeolocationService>.Instance);
        return (service, handler);
    }

    [Theory]
    [InlineData("bad\nvalue")]
    [InlineData("203.0.113.5\r\nX-Injected: 1")]
    [InlineData("not-an-ip")]
    [InlineData("203.0.113.5 extra")]
    public async Task GetLocation_NonIpInput_ReturnsNullWithoutOutboundLookup(string input)
    {
        (IpGeolocationService service, CountingHandler handler) = Create();

        IpLocation? location = await service.GetLocationAsync(input);

        location.Should().BeNull();
        handler.Calls.Should().Be(0);
    }

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("::1")]
    [InlineData("localhost")]
    [InlineData("10.1.2.3")]
    [InlineData("192.168.0.9")]
    [InlineData("fd00::1")]
    public async Task GetLocation_LoopbackOrPrivate_ReturnsLocalWithoutOutboundLookup(string input)
    {
        (IpGeolocationService service, CountingHandler handler) = Create();

        IpLocation? location = await service.GetLocationAsync(input);

        location.Should().NotBeNull();
        location!.Country.Should().Be("Local");
        handler.Calls.Should().Be(0);
    }

    [Fact]
    public async Task GetLocation_PublicIp_LooksUpAndParsesLocation()
    {
        (IpGeolocationService service, CountingHandler handler) = Create();

        IpLocation? location = await service.GetLocationAsync("8.8.8.8");

        location.Should().Be(new IpLocation("US", "California", "Oakland"));
        handler.Calls.Should().Be(1);
    }

    [Fact]
    public async Task GetLocation_PublicIp_IsCachedAfterFirstLookup()
    {
        (IpGeolocationService service, CountingHandler handler) = Create();

        await service.GetLocationAsync("8.8.4.4");
        await service.GetLocationAsync("8.8.4.4");

        handler.Calls.Should().Be(1);
    }
}
