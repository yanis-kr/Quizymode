namespace Quizymode.Api.Services;

/// <inheritdoc cref="IAttributionClassifier"/>
internal sealed class AttributionClassifier : IAttributionClassifier
{
    private const int UtmMaxLength = 100;
    private const int ReferrerHostMaxLength = 255;

    private static readonly string[] SearchEngineHosts =
    [
        "google", "bing", "duckduckgo", "yahoo", "baidu", "yandex"
    ];

    private static readonly string[] SocialHosts =
    [
        "reddit", "facebook", "instagram", "x.com", "t.co", "linkedin",
        "youtube", "tiktok", "pinterest", "discord", "news.ycombinator.com"
    ];

    private static readonly string[] PaidUtmMediums =
    [
        "cpc", "ppc", "paid", "paid_social", "paidsocial", "display", "cpm"
    ];

    public AttributionResult Classify(AttributionRequest request)
    {
        string? referrerHost = ReduceReferrer(request.ReferrerUrl, request.RequestHost);

        string? utmSource = Truncate(request.UtmSource);
        string? utmMedium = Truncate(request.UtmMedium);
        string? utmCampaign = Truncate(request.UtmCampaign);
        string? utmContent = Truncate(request.UtmContent);
        string? utmTerm = Truncate(request.UtmTerm);

        string? clickIdPlatform = ClassifyClickIdPlatform(request);
        bool hasAnyUtmTag = utmSource is not null || utmMedium is not null || utmCampaign is not null
            || utmContent is not null || utmTerm is not null;

        string channel = ClassifyChannel(clickIdPlatform, utmMedium, hasAnyUtmTag, referrerHost);

        return new AttributionResult(
            referrerHost,
            utmSource,
            utmMedium,
            utmCampaign,
            utmContent,
            utmTerm,
            clickIdPlatform,
            channel);
    }

    public string ClassifyDeviceClass(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
        {
            return "unknown";
        }

        if (Contains(userAgent, "iPad") || Contains(userAgent, "Tablet"))
        {
            return "tablet";
        }

        if (Contains(userAgent, "Mobile"))
        {
            return "mobile";
        }

        return "desktop";
    }

    /// <summary>Extracts and truncates the referrer's host; null for same-site or absent referrers.</summary>
    private static string? ReduceReferrer(string? referrerUrl, string? requestHost)
    {
        if (string.IsNullOrWhiteSpace(referrerUrl))
        {
            return null;
        }

        if (!Uri.TryCreate(referrerUrl, UriKind.Absolute, out Uri? parsed))
        {
            return null;
        }

        string host = parsed.Host;
        if (string.IsNullOrWhiteSpace(host))
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(requestHost) && string.Equals(host, requestHost, StringComparison.OrdinalIgnoreCase))
        {
            // Same-site referrer (e.g. in-app navigation): not an acquisition signal.
            return null;
        }

        return host.Length > ReferrerHostMaxLength ? host[..ReferrerHostMaxLength] : host;
    }

    private static string? ClassifyClickIdPlatform(AttributionRequest request)
    {
        if (IsPresent(request.Gclid) || IsPresent(request.Gbraid) || IsPresent(request.Wbraid))
        {
            return "google";
        }

        if (IsPresent(request.Msclkid))
        {
            return "microsoft";
        }

        if (IsPresent(request.Ttclid))
        {
            return "tiktok";
        }

        return null;
    }

    private static string ClassifyChannel(
        string? clickIdPlatform,
        string? utmMedium,
        bool hasAnyUtmTag,
        string? referrerHost)
    {
        // (1) paid: an ad click-id is present, or utm_medium names a paid medium.
        if (clickIdPlatform is not null ||
            (utmMedium is not null && PaidUtmMediums.Contains(utmMedium, StringComparer.OrdinalIgnoreCase)))
        {
            return "paid";
        }

        // (2) email
        if (string.Equals(utmMedium, "email", StringComparison.OrdinalIgnoreCase))
        {
            return "email";
        }

        // (3) campaign: any other utm_* tag present.
        if (hasAnyUtmTag)
        {
            return "campaign";
        }

        // (4) search
        if (referrerHost is not null && MatchesAnyHost(referrerHost, SearchEngineHosts))
        {
            return "search";
        }

        // (5) social
        if (referrerHost is not null && MatchesAnyHost(referrerHost, SocialHosts))
        {
            return "social";
        }

        // (6) referral: any other non-empty external referrer host.
        if (referrerHost is not null)
        {
            return "referral";
        }

        // (7) direct: no referrer and no tags.
        return "direct";
    }

    private static bool MatchesAnyHost(string host, string[] candidates)
    {
        foreach (string candidate in candidates)
        {
            if (host.Contains(candidate, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsPresent(string? value) => !string.IsNullOrWhiteSpace(value);

    private static bool Contains(string haystack, string marker) =>
        haystack.Contains(marker, StringComparison.OrdinalIgnoreCase);

    private static string? Truncate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length > UtmMaxLength ? value[..UtmMaxLength] : value;
    }
}
