namespace Quizymode.Api.Services;

/// <summary>Raw, client-reported attribution signals for one page hit (TRAFFIC-122).</summary>
public sealed record AttributionRequest(
    string? ReferrerUrl,
    string? RequestHost,
    string? UtmSource = null,
    string? UtmMedium = null,
    string? UtmCampaign = null,
    string? UtmContent = null,
    string? UtmTerm = null,
    string? Gclid = null,
    string? Gbraid = null,
    string? Wbraid = null,
    string? Msclkid = null,
    string? Ttclid = null);

/// <summary>Derived attribution for one <see cref="Shared.Models.AnalyticsSession"/> row.</summary>
public sealed record AttributionResult(
    string? ReferrerHost,
    string? UtmSource,
    string? UtmMedium,
    string? UtmCampaign,
    string? UtmContent,
    string? UtmTerm,
    string? ClickIdPlatform,
    string Channel);

/// <summary>
/// Pure, side-effect-free classification of first-hit traffic attribution: referrer reduction,
/// channel classification, click-id-to-platform mapping (never the raw click-id value), UTM
/// truncation, and device-class detection from a user-agent string. No DB or HTTP calls.
/// </summary>
public interface IAttributionClassifier
{
    AttributionResult Classify(AttributionRequest request);

    /// <summary>Returns "mobile", "tablet", "desktop", or "unknown".</summary>
    string ClassifyDeviceClass(string? userAgent);
}
