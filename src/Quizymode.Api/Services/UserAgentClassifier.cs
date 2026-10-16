namespace Quizymode.Api.Services;

/// <summary>
/// Coarse, privacy-preserving buckets for a user-agent string: a device class and a browser family.
/// Used to show the browser and device mix of front-end errors without storing anything finer.
/// </summary>
internal static class UserAgentClassifier
{
    public const string Desktop = "desktop";
    public const string Mobile = "mobile";
    public const string Tablet = "tablet";
    public const string Unknown = "unknown";

    public static string DeviceClass(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
        {
            return Unknown;
        }

        string ua = userAgent.ToLowerInvariant();

        if (ua.Contains("ipad", StringComparison.Ordinal) ||
            ua.Contains("tablet", StringComparison.Ordinal) ||
            ua.Contains("kindle", StringComparison.Ordinal) ||
            ua.Contains("silk/", StringComparison.Ordinal) ||
            (ua.Contains("android", StringComparison.Ordinal) && !ua.Contains("mobile", StringComparison.Ordinal)))
        {
            return Tablet;
        }

        if (ua.Contains("mobi", StringComparison.Ordinal) ||
            ua.Contains("iphone", StringComparison.Ordinal) ||
            ua.Contains("ipod", StringComparison.Ordinal) ||
            ua.Contains("windows phone", StringComparison.Ordinal))
        {
            return Mobile;
        }

        return Desktop;
    }

    public static string BrowserFamily(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
        {
            return "Unknown";
        }

        if (userAgent.Contains("Edg/", StringComparison.Ordinal) ||
            userAgent.Contains("EdgA/", StringComparison.Ordinal) ||
            userAgent.Contains("EdgiOS/", StringComparison.Ordinal))
        {
            return "Edge";
        }

        if (userAgent.Contains("OPR/", StringComparison.Ordinal) || userAgent.Contains("Opera", StringComparison.Ordinal))
        {
            return "Opera";
        }

        if (userAgent.Contains("SamsungBrowser/", StringComparison.Ordinal))
        {
            return "Samsung Internet";
        }

        if (userAgent.Contains("Firefox/", StringComparison.Ordinal) || userAgent.Contains("FxiOS/", StringComparison.Ordinal))
        {
            return "Firefox";
        }

        if (userAgent.Contains("Chrome/", StringComparison.Ordinal) ||
            userAgent.Contains("CriOS/", StringComparison.Ordinal) ||
            userAgent.Contains("Chromium/", StringComparison.Ordinal))
        {
            return "Chrome";
        }

        if (userAgent.Contains("Safari/", StringComparison.Ordinal))
        {
            return "Safari";
        }

        return "Other";
    }
}
