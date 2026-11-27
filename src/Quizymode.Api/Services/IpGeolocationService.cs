using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Internal;

namespace Quizymode.Api.Services;

internal sealed class IpGeolocationService : IIpGeolocationService
{
    private static readonly HashSet<string> LoopbackAddresses = new(StringComparer.OrdinalIgnoreCase)
    {
        "::1", "127.0.0.1", "0:0:0:0:0:0:0:1", "localhost"
    };

    private const int DefaultCacheSizeLimit = 10_000;
    private static readonly TimeSpan SuccessTtl = TimeSpan.FromHours(24);
    private static readonly TimeSpan FailureTtl = TimeSpan.FromMinutes(10);

    // Shorter than the 2 s budget of page-view tracking, so a slow lookup ends here and is cached as a failure
    // rather than counting as the caller giving up.
    private static readonly TimeSpan LookupTimeout = TimeSpan.FromMilliseconds(1800);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<IpGeolocationService> _logger;

    // Private, so its size limit does not apply to the application's shared IMemoryCache.
    private readonly MemoryCache _cache;

    public IpGeolocationService(
        IHttpClientFactory httpClientFactory,
        ILogger<IpGeolocationService> logger,
        int cacheSizeLimit = DefaultCacheSizeLimit,
        ISystemClock? clock = null)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = cacheSizeLimit, Clock = clock });
    }

    internal int CacheCount => _cache.Count;

    public async Task<string?> GetCountryAsync(string ipAddress, CancellationToken cancellationToken = default)
    {
        IpLocation? location = await GetLocationAsync(ipAddress, cancellationToken);
        return location?.Country;
    }

    public async Task<IpLocation?> GetLocationAsync(string ipAddress, CancellationToken cancellationToken = default)
    {
        IpLocation local = new("Local", null, null);

        if (string.IsNullOrWhiteSpace(ipAddress) || ipAddress == "unknown")
            return null;

        if (LoopbackAddresses.Contains(ipAddress))
            return local;

        // The value comes from a client-controlled header (X-Forwarded-For). Reject anything that is not an IP address
        // before it reaches the cache, the outbound lookup or the logs.
        if (!IPAddress.TryParse(ipAddress, out IPAddress? parsed))
            return null;

        // Private/link-local ranges → Local
        if (IsPrivate(parsed))
            return local;

        string key = parsed.ToString();

        // A cached null is a remembered failure, which TryGetValue tells apart from a miss.
        if (_cache.TryGetValue(key, out IpLocation? cached))
            return cached;

        try
        {
            using CancellationTokenSource timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(LookupTimeout);

            HttpClient client = _httpClientFactory.CreateClient("ipgeolocation");
            HttpResponseMessage response = await client.GetAsync(
                $"https://ipinfo.io/{Uri.EscapeDataString(ipAddress)}/json",
                timeout.Token);

            if (!response.IsSuccessStatusCode)
                return Remember(key, null, FailureTtl);

            string json = await response.Content.ReadAsStringAsync(timeout.Token);
            using JsonDocument doc = JsonDocument.Parse(json);
            JsonElement root = doc.RootElement;

            // ipinfo returns { "bogon": true } for private/reserved ranges
            if (root.TryGetProperty("bogon", out JsonElement bogon) && bogon.GetBoolean())
                return Remember(key, local, SuccessTtl);

            return Remember(key, ParseLocation(root), SuccessTtl);
        }
        catch (Exception) when (cancellationToken.IsCancellationRequested)
        {
            // The caller gave up; that says nothing about the address, so nothing is cached.
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "IP geolocation lookup failed for {IpAddress}", key);
            return Remember(key, null, FailureTtl);
        }
    }

    private IpLocation? Remember(string key, IpLocation? location, TimeSpan ttl)
    {
        _cache.Set(key, location, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = ttl });
        return location;
    }

    /// <summary>Reads country, region and city from an ipinfo response; blank values become null and are length-capped.</summary>
    internal static IpLocation ParseLocation(JsonElement root)
    {
        return new IpLocation(
            ReadString(root, "country", 8),
            ReadString(root, "region", 100),
            ReadString(root, "city", 100));
    }

    private static string? ReadString(JsonElement root, string name, int maxLength)
    {
        if (!root.TryGetProperty(name, out JsonElement element) || element.ValueKind != JsonValueKind.String)
            return null;

        string? value = element.GetString()?.Trim();
        if (string.IsNullOrEmpty(value))
            return null;

        return value.Length > maxLength ? value[..maxLength] : value;
    }

    private static bool IsPrivate(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6)
            ip = ip.MapToIPv4();

        byte[] bytes = ip.GetAddressBytes();

        if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
        {
            // 10.x.x.x
            if (bytes[0] == 10) return true;
            // 172.16.x.x – 172.31.x.x
            if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;
            // 192.168.x.x
            if (bytes[0] == 192 && bytes[1] == 168) return true;
            // 169.254.x.x (link-local)
            if (bytes[0] == 169 && bytes[1] == 254) return true;
        }

        if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
        {
            // fc00::/7 (unique local)
            if ((bytes[0] & 0xFE) == 0xFC) return true;
            // fe80::/10 (link-local)
            if (bytes[0] == 0xFE && (bytes[1] & 0xC0) == 0x80) return true;
        }

        return false;
    }
}
