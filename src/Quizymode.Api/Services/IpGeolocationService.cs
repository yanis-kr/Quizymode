using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;

namespace Quizymode.Api.Services;

internal sealed class IpGeolocationService : IIpGeolocationService
{
    private static readonly HashSet<string> LoopbackAddresses = new(StringComparer.OrdinalIgnoreCase)
    {
        "::1", "127.0.0.1", "0:0:0:0:0:0:0:1", "localhost"
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<IpGeolocationService> _logger;
    private readonly ConcurrentDictionary<string, string?> _cache = new(StringComparer.OrdinalIgnoreCase);

    public IpGeolocationService(IHttpClientFactory httpClientFactory, ILogger<IpGeolocationService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<string?> GetCountryAsync(string ipAddress, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(ipAddress) || ipAddress == "unknown")
            return null;

        if (LoopbackAddresses.Contains(ipAddress))
            return "Local";

        // Private/link-local ranges → Local
        if (IPAddress.TryParse(ipAddress, out IPAddress? parsed) && IsPrivate(parsed))
            return "Local";

        if (_cache.TryGetValue(ipAddress, out string? cached))
            return cached;

        try
        {
            HttpClient client = _httpClientFactory.CreateClient("ipgeolocation");
            HttpResponseMessage response = await client.GetAsync(
                $"https://ipinfo.io/{Uri.EscapeDataString(ipAddress)}/json",
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _cache[ipAddress] = null;
                return null;
            }

            string json = await response.Content.ReadAsStringAsync(cancellationToken);
            using JsonDocument doc = JsonDocument.Parse(json);
            JsonElement root = doc.RootElement;

            // ipinfo returns { "bogon": true } for private/reserved ranges
            if (root.TryGetProperty("bogon", out JsonElement bogon) && bogon.GetBoolean())
            {
                _cache[ipAddress] = "Local";
                return "Local";
            }

            string? country = root.TryGetProperty("country", out JsonElement countryEl)
                ? countryEl.GetString()
                : null;

            _cache[ipAddress] = country;
            return country;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "IP geolocation lookup failed for {IpAddress}", ipAddress);
            _cache[ipAddress] = null;
            return null;
        }
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
