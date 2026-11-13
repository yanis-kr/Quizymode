using System.Security.Cryptography;
using System.Text;
using FluentAssertions;
using Quizymode.Api.Features.Media;
using Quizymode.Api.Features.Media.Storage;
using Xunit;

namespace Quizymode.Api.Tests.Features.Media;

public sealed class CloudFrontUrlSignerTests
{
    private static readonly string ObjectKey = MediaObjectKey.Build(Guid.Parse("0c9f2b3a-4d5e-4f6a-8b7c-6d5e4f3a2b1c"), new string('a', 64));

    private static DeliverySettings Settings(string pem, int seconds = 300) => new()
    {
        Mode = DeliverySettings.ModeCloudFront,
        CloudFrontDomain = "d111111abcdef8.cloudfront.net",
        KeyPairId = "K2TESTKEYPAIR",
        PrivateKeyBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(pem)),
        SignedUrlSeconds = seconds
    };

    private static string NewPrivatePem()
    {
        using RSA rsa = RSA.Create(2048);
        return rsa.ExportRSAPrivateKeyPem();
    }

    [Fact]
    public void TryCreate_ReturnsNullWhenAnySettingIsMissing()
    {
        string pem = NewPrivatePem();
        CloudFrontUrlSigner.TryCreate(Settings(pem) with { CloudFrontDomain = null }).Should().BeNull();
        CloudFrontUrlSigner.TryCreate(Settings(pem) with { KeyPairId = " " }).Should().BeNull();
        CloudFrontUrlSigner.TryCreate(Settings(pem) with { PrivateKeyBase64 = null }).Should().BeNull();
    }

    [Theory]
    [InlineData("https://d111111abcdef8.cloudfront.net")]
    [InlineData("d111111abcdef8.cloudfront.net/normalized")]
    [InlineData("bad domain.example")]
    public void TryCreate_RejectsDomainsThatAreNotBareHosts(string domain)
    {
        string pem = NewPrivatePem();
        CloudFrontUrlSigner.TryCreate(Settings(pem) with { CloudFrontDomain = domain }).Should().BeNull();
    }

    [Theory]
    [InlineData(59)]
    [InlineData(601)]
    public void TryCreate_RejectsLifetimesOutsideTheBound(int seconds)
    {
        CloudFrontUrlSigner.TryCreate(Settings(NewPrivatePem(), seconds)).Should().BeNull();
    }

    [Fact]
    public void TryCreate_FailsClosedOnAKeyThatIsNotPem()
    {
        DeliverySettings settings = Settings("not a key") with { PrivateKeyBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes("not a key")) };
        CloudFrontUrlSigner.TryCreate(settings).Should().BeNull();
    }

    [Fact]
    public void TryCreate_FailsClosedOnNonBase64Key()
    {
        DeliverySettings settings = Settings(NewPrivatePem()) with { PrivateKeyBase64 = "%%%not-base64%%%" };
        CloudFrontUrlSigner.TryCreate(settings).Should().BeNull();
    }

    [Fact]
    public void SignedUrl_CarriesExpiryKeyPairAndAVerifiableSignature()
    {
        using RSA reference = RSA.Create(2048);
        string pem = reference.ExportRSAPrivateKeyPem();
        using CloudFrontUrlSigner signer = CloudFrontUrlSigner.TryCreate(Settings(pem, 300))!;
        DateTimeOffset now = new(2026, 11, 12, 12, 0, 0, TimeSpan.Zero);

        string url = signer.SignedUrl(ObjectKey, now);

        Uri uri = new(url);
        uri.Scheme.Should().Be("https");
        uri.Host.Should().Be("d111111abcdef8.cloudfront.net");
        uri.AbsolutePath.Should().Be("/" + ObjectKey);
        string[] query = uri.Query.TrimStart('?').Split('&');
        string expires = query.Single(p => p.StartsWith("Expires=", StringComparison.Ordinal))["Expires=".Length..];
        string signature = query.Single(p => p.StartsWith("Signature=", StringComparison.Ordinal))["Signature=".Length..];
        query.Should().Contain("Key-Pair-Id=K2TESTKEYPAIR");
        expires.Should().Be(now.AddSeconds(300).ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture));

        string policy = "{\"Statement\":[{\"Resource\":\"https://d111111abcdef8.cloudfront.net/" + ObjectKey + "\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":" + expires + "}}}]}";
        byte[] raw = Convert.FromBase64String(signature.Replace('-', '+').Replace('_', '=').Replace('~', '/'));
        reference.VerifyData(Encoding.UTF8.GetBytes(policy), raw, HashAlgorithmName.SHA1, RSASignaturePadding.Pkcs1).Should().BeTrue();
    }

    [Fact]
    public void SignedUrl_RejectsAnObjectKeyOutsideTheNormalizedPrefix()
    {
        using CloudFrontUrlSigner signer = CloudFrontUrlSigner.TryCreate(Settings(NewPrivatePem()))!;
        Action act = () => signer.SignedUrl("../other/secret.webp", DateTimeOffset.UtcNow);
        act.Should().Throw<MediaStorageException>();
    }

    [Fact]
    public void UrlSafe_ReplacesTheThreeBase64CharactersCloudFrontRejects()
    {
        CloudFrontUrlSigner.UrlSafe("a+b/c=").Should().Be("a-b~c_");
    }
}
