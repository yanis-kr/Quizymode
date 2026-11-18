namespace Quizymode.Api.Services;

internal static class RequestMetadataHelper
{
    private const int UserAgentMaxLength = 512;

    public static string? GetUserAgent(HttpContext? httpContext)
    {
        string? userAgent = httpContext?.Request.Headers.UserAgent.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(userAgent))
        {
            return null;
        }

        userAgent = userAgent.Trim();

        return userAgent.Length > UserAgentMaxLength
            ? userAgent[..UserAgentMaxLength]
            : userAgent;
    }

    /// <summary>
    /// The client address as the server observed it: <c>Connection.RemoteIpAddress</c>, which <c>UseForwardedHeaders</c>
    /// replaces only with the hop a configured trusted proxy appended. Client-sent X-Forwarded-For and X-Real-IP values are
    /// never read here (AC 16.3.1). IPv4-mapped IPv6 addresses are unwrapped.
    /// </summary>
    public static string GetClientIpAddress(HttpContext? httpContext)
    {
        System.Net.IPAddress? address = httpContext?.Connection.RemoteIpAddress;
        if (address is null)
        {
            return "unknown";
        }

        return address.IsIPv4MappedToIPv6 ? address.MapToIPv4().ToString() : address.ToString();
    }
}
