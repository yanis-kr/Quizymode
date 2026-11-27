using System.Net;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.Internal;
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

    // AC 17.7 (#904)

    private sealed class FakeClock : ISystemClock
    {
        public DateTimeOffset UtcNow { get; set; } = new(2026, 11, 27, 12, 0, 0, TimeSpan.Zero);
    }

    private sealed class StubHandler(Func<CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public int Calls { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            return respond(cancellationToken);
        }
    }

    private static Task<HttpResponseMessage> Ok() => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = new StringContent("""{"country":"US"}""", Encoding.UTF8, "application/json"),
    });

    private static IpGeolocationService Service(HttpMessageHandler handler, ISystemClock? clock = null, int sizeLimit = 100) =>
        new(new SingleClientFactory(handler), NullLogger<IpGeolocationService>.Instance, sizeLimit, clock);

    [Fact]
    public async Task Cache_NeverExceedsItsSizeLimit()
    {
        StubHandler handler = new(_ => Ok());
        IpGeolocationService service = Service(handler, sizeLimit: 3);

        for (int i = 1; i <= 20; i++)
        {
            await service.GetLocationAsync($"8.8.8.{i}");
            service.CacheCount.Should().BeLessThanOrEqualTo(3);
        }
    }

    [Fact]
    public async Task SuccessfulLookup_IsHeldForTwentyFourHours()
    {
        FakeClock clock = new();
        StubHandler handler = new(_ => Ok());
        IpGeolocationService service = Service(handler, clock);
        await service.GetLocationAsync("8.8.8.8");

        clock.UtcNow += TimeSpan.FromHours(24) - TimeSpan.FromSeconds(1);
        await service.GetLocationAsync("8.8.8.8");
        handler.Calls.Should().Be(1);

        clock.UtcNow += TimeSpan.FromSeconds(2);
        await service.GetLocationAsync("8.8.8.8");
        handler.Calls.Should().Be(2);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FailedLookup_IsRetriedAfterTenMinutesAndNotBefore(bool throws)
    {
        FakeClock clock = new();
        StubHandler handler = new(_ => throws
            ? throw new HttpRequestException("unreachable")
            : Task.FromResult(new HttpResponseMessage(HttpStatusCode.TooManyRequests)));
        IpGeolocationService service = Service(handler, clock);
        (await service.GetLocationAsync("8.8.8.8")).Should().BeNull();

        clock.UtcNow += TimeSpan.FromMinutes(10) - TimeSpan.FromSeconds(1);
        (await service.GetLocationAsync("8.8.8.8")).Should().BeNull();
        handler.Calls.Should().Be(1);

        clock.UtcNow += TimeSpan.FromSeconds(2);
        await service.GetLocationAsync("8.8.8.8");
        handler.Calls.Should().Be(2);
    }

    [Fact]
    public async Task SlowLookup_EndsAtTheServiceTimeoutAndIsCachedAsAFailure()
    {
        StubHandler handler = new(async token =>
        {
            await Task.Delay(Timeout.Infinite, token);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        IpGeolocationService service = Service(handler);

        (await service.GetLocationAsync("8.8.8.8")).Should().BeNull();
        (await service.GetLocationAsync("8.8.8.8")).Should().BeNull();

        handler.Calls.Should().Be(1);
    }

    [Fact]
    public async Task LookupCancelledByTheCaller_IsNotCached()
    {
        using CancellationTokenSource caller = new();
        StubHandler handler = new(token =>
        {
            if (!caller.IsCancellationRequested)
            {
                caller.Cancel();
                token.ThrowIfCancellationRequested();
            }

            return Ok();
        });
        IpGeolocationService service = Service(handler);

        (await service.GetLocationAsync("8.8.8.8", caller.Token)).Should().BeNull();
        service.CacheCount.Should().Be(0);

        (await service.GetLocationAsync("8.8.8.8")).Should().NotBeNull();
        handler.Calls.Should().Be(2);
    }
}
