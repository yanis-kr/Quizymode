using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Quizymode.Api.Features.Media.Storage;

namespace Quizymode.Api.Features.Media;

/// <summary>Picture delivery settings (#405). Proxy streams bytes through the API; CloudFront answers 302 to a short-lived signed URL.</summary>
internal sealed record DeliverySettings
{
    public const string ModeProxy = "Proxy";
    public const string ModeCloudFront = "CloudFront";

    public const int MinSignedUrlSeconds = 60;
    public const int MaxSignedUrlSeconds = 600;

    /// <summary>Proxy (default) or CloudFront. Any other value is refused and answers 503.</summary>
    public string Mode { get; set; } = ModeProxy;

    /// <summary>CloudFront domain without a scheme, for example d123abc.cloudfront.net.</summary>
    public string? CloudFrontDomain { get; set; }

    /// <summary>Public key id of the CloudFront trusted key group that signs the URLs.</summary>
    public string? KeyPairId { get; set; }

    /// <summary>Base64 of the PEM private key. Secret: set only in the Lightsail environment, never committed or logged.</summary>
    public string? PrivateKeyBase64 { get; set; }

    /// <summary>Signed URL lifetime. It bounds how long a withdrawn picture can still be fetched by a URL already issued.</summary>
    public int SignedUrlSeconds { get; set; } = 300;
}

/// <summary>Builds CloudFront canned-policy signed URLs with RSA-SHA1, as CloudFront requires for trusted key groups.</summary>
internal sealed class CloudFrontUrlSigner : IDisposable
{
    private readonly RSA _rsa;
    private readonly string _domain;
    private readonly string _keyPairId;
    private readonly int _seconds;

    private CloudFrontUrlSigner(RSA rsa, string domain, string keyPairId, int seconds)
    {
        _rsa = rsa;
        _domain = domain;
        _keyPairId = keyPairId;
        _seconds = seconds;
    }

    /// <summary>Returns null (fail closed) when any setting is missing or invalid, or the key cannot be imported.</summary>
    public static CloudFrontUrlSigner? TryCreate(DeliverySettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.CloudFrontDomain) || string.IsNullOrWhiteSpace(settings.KeyPairId) || string.IsNullOrWhiteSpace(settings.PrivateKeyBase64)) return null;
        string domain = settings.CloudFrontDomain.Trim();
        if (domain.Contains("://", StringComparison.Ordinal) || domain.Contains('/', StringComparison.Ordinal) || domain.Contains(' ', StringComparison.Ordinal)) return null;
        if (settings.SignedUrlSeconds is < DeliverySettings.MinSignedUrlSeconds or > DeliverySettings.MaxSignedUrlSeconds) return null;
        try
        {
            string pem = Encoding.UTF8.GetString(Convert.FromBase64String(settings.PrivateKeyBase64.Trim()));
            RSA rsa = RSA.Create();
            try
            {
                rsa.ImportFromPem(pem);
                return new CloudFrontUrlSigner(rsa, domain, settings.KeyPairId.Trim(), settings.SignedUrlSeconds);
            }
            catch
            {
                rsa.Dispose();
                return null;
            }
        }
        catch (FormatException)
        {
            return null;
        }
    }

    /// <summary>Signed https URL for an already validated object key, valid until now + configured lifetime.</summary>
    public string SignedUrl(string objectKey, DateTimeOffset now)
    {
        MediaObjectKey.EnsureValid(objectKey);
        string resource = "https://" + _domain + "/" + objectKey;
        long expires = now.AddSeconds(_seconds).ToUnixTimeSeconds();
        string policy = "{\"Statement\":[{\"Resource\":\"" + resource + "\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":" + expires.ToString(System.Globalization.CultureInfo.InvariantCulture) + "}}}]}";
        byte[] signature = _rsa.SignData(Encoding.UTF8.GetBytes(policy), HashAlgorithmName.SHA1, RSASignaturePadding.Pkcs1);
        return resource + "?Expires=" + expires.ToString(System.Globalization.CultureInfo.InvariantCulture)
            + "&Signature=" + UrlSafe(Convert.ToBase64String(signature))
            + "&Key-Pair-Id=" + _keyPairId;
    }

    internal static string UrlSafe(string base64) => base64.Replace('+', '-').Replace('=', '_').Replace('/', '~');

    public void Dispose() => _rsa.Dispose();
}

/// <summary>Caches one signer per options instance, so the PEM is imported once rather than per request.</summary>
internal static class CloudFrontPictureDelivery
{
    private static readonly object Gate = new();
    private static DeliverySettings? _cachedFor;
    private static CloudFrontUrlSigner? _cached;

    public static CloudFrontUrlSigner? SignerFor(IOptions<MediaOptions> options)
    {
        DeliverySettings settings = options.Value.Delivery;
        lock (Gate)
        {
            if (!ReferenceEquals(_cachedFor, settings))
            {
                _cached?.Dispose();
                _cached = CloudFrontUrlSigner.TryCreate(settings);
                _cachedFor = settings;
            }
            return _cached;
        }
    }

    public static bool IsCloudFrontMode(IOptions<MediaOptions> options) =>
        string.Equals(options.Value.Delivery.Mode, DeliverySettings.ModeCloudFront, StringComparison.Ordinal);

    public static bool IsKnownMode(IOptions<MediaOptions> options) =>
        options.Value.Delivery.Mode is DeliverySettings.ModeProxy or DeliverySettings.ModeCloudFront;
}

/// <summary>302 to a signed CloudFront URL. no-store keeps the signed URL out of browser and shared caches.</summary>
internal sealed class PrivateRedirectResult(string location) : IResult
{
    public Task ExecuteAsync(HttpContext httpContext)
    {
        HttpResponse response = httpContext.Response;
        response.StatusCode = StatusCodes.Status302Found;
        response.Headers.CacheControl = "private, no-store";
        response.Headers.Location = location;
        return Task.CompletedTask;
    }
}
