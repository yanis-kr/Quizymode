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

    public static string GetClientIpAddress(HttpContext? httpContext)
    {
        if (httpContext is null)
        {
            return "unknown";
        }

        string? forwardedFor = httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedFor))
        {
            string[] ips = forwardedFor.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (ips.Length > 0)
            {
                return ips[0];
            }
        }

        string? realIp = httpContext.Request.Headers["X-Real-IP"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(realIp))
        {
            return realIp;
        }

        return httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}
