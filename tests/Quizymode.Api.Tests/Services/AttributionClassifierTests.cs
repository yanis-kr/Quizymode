using System.Linq;
using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class AttributionClassifierTests
{
    private readonly IAttributionClassifier _classifier = new AttributionClassifier();

    [Fact]
    public void Classify_NoReferrerNoTags_IsDirect()
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(ReferrerUrl: null, RequestHost: "www.quizymode.com"));

        result.Channel.Should().Be("direct");
        result.ReferrerHost.Should().BeNull();
        result.ClickIdPlatform.Should().BeNull();
    }

    [Fact]
    public void Classify_SameSiteReferrer_IsTreatedAsNone()
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: "https://www.quizymode.com/categories",
            RequestHost: "www.quizymode.com"));

        result.ReferrerHost.Should().BeNull();
        result.Channel.Should().Be("direct");
    }

    [Fact]
    public void Classify_SameSiteReferrer_IsCaseInsensitive()
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: "https://WWW.Quizymode.com/categories",
            RequestHost: "www.quizymode.com"));

        result.ReferrerHost.Should().BeNull();
    }

    [Theory]
    [InlineData("https://www.google.com/search?q=quiz", "search")]
    [InlineData("https://www.bing.com/search", "search")]
    [InlineData("https://duckduckgo.com/", "search")]
    [InlineData("https://search.yahoo.com/", "search")]
    [InlineData("https://www.baidu.com/", "search")]
    [InlineData("https://yandex.com/", "search")]
    public void Classify_SearchEngineReferrer_IsSearch(string referrerUrl, string expectedChannel)
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: referrerUrl,
            RequestHost: "www.quizymode.com"));

        result.Channel.Should().Be(expectedChannel);
    }

    [Theory]
    [InlineData("https://www.reddit.com/r/trivia")]
    [InlineData("https://www.facebook.com/")]
    [InlineData("https://www.instagram.com/")]
    [InlineData("https://x.com/")]
    [InlineData("https://t.co/abc123")]
    [InlineData("https://www.linkedin.com/")]
    [InlineData("https://www.youtube.com/")]
    [InlineData("https://www.tiktok.com/")]
    [InlineData("https://www.pinterest.com/")]
    [InlineData("https://discord.com/")]
    [InlineData("https://news.ycombinator.com/")]
    public void Classify_SocialReferrer_IsSocial(string referrerUrl)
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: referrerUrl,
            RequestHost: "www.quizymode.com"));

        result.Channel.Should().Be("social");
    }

    [Fact]
    public void Classify_FacebookClickId_WithFacebookReferrer_IsSocialNotPaid()
    {
        // fbclid is appended by Facebook to organic shares too, so it must never be treated as a
        // paid signal on its own; with no utm/ad-click-id, a facebook.com referrer stays "social".
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: "https://www.facebook.com/?fbclid=IwAR123abc",
            RequestHost: "www.quizymode.com"));

        result.Channel.Should().Be("social");
        result.ClickIdPlatform.Should().BeNull();
    }

    [Fact]
    public void Classify_OtherExternalReferrer_IsReferral()
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: "https://some-other-site.example/",
            RequestHost: "www.quizymode.com"));

        result.Channel.Should().Be("referral");
        result.ReferrerHost.Should().Be("some-other-site.example");
    }

    [Theory]
    [InlineData("cpc")]
    [InlineData("ppc")]
    [InlineData("paid")]
    [InlineData("paid_social")]
    [InlineData("paidsocial")]
    [InlineData("display")]
    [InlineData("cpm")]
    public void Classify_PaidUtmMedium_IsPaid(string utmMedium)
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: null,
            RequestHost: "www.quizymode.com",
            UtmMedium: utmMedium));

        result.Channel.Should().Be("paid");
    }

    [Theory]
    [InlineData("gclid", "abc123", "google")]
    [InlineData("gbraid", "abc123", "google")]
    [InlineData("wbraid", "abc123", "google")]
    [InlineData("msclkid", "abc123", "microsoft")]
    [InlineData("ttclid", "abc123", "tiktok")]
    public void Classify_AdClickId_MapsToPlatformAndIsPaid(string paramName, string value, string expectedPlatform)
    {
        AttributionRequest request = paramName switch
        {
            "gclid" => new AttributionRequest(null, "www.quizymode.com", Gclid: value),
            "gbraid" => new AttributionRequest(null, "www.quizymode.com", Gbraid: value),
            "wbraid" => new AttributionRequest(null, "www.quizymode.com", Wbraid: value),
            "msclkid" => new AttributionRequest(null, "www.quizymode.com", Msclkid: value),
            "ttclid" => new AttributionRequest(null, "www.quizymode.com", Ttclid: value),
            _ => throw new InvalidOperationException()
        };

        AttributionResult result = _classifier.Classify(request);

        result.ClickIdPlatform.Should().Be(expectedPlatform);
        result.Channel.Should().Be("paid");
    }

    [Fact]
    public void Classify_ClickIdValue_IsNeverReturned()
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: null,
            RequestHost: "www.quizymode.com",
            Gclid: "super-secret-click-id-value"));

        // Only the platform name is exposed; the classifier result type has no field for the raw value.
        result.ClickIdPlatform.Should().Be("google");
    }

    [Fact]
    public void Classify_EmailUtmMedium_IsEmail()
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: null,
            RequestHost: "www.quizymode.com",
            UtmMedium: "email"));

        result.Channel.Should().Be("email");
    }

    [Fact]
    public void Classify_AnyOtherUtmTag_IsCampaign()
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: "https://www.google.com/search",
            RequestHost: "www.quizymode.com",
            UtmSource: "newsletter"));

        // A utm tag outranks a search-engine referrer (rule 3 before rule 4).
        result.Channel.Should().Be("campaign");
    }

    [Fact]
    public void Classify_OversizedUtmValue_IsTruncatedTo100Chars()
    {
        string oversized = new('a', 250);

        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: null,
            RequestHost: "www.quizymode.com",
            UtmSource: oversized,
            UtmCampaign: oversized,
            UtmContent: oversized,
            UtmTerm: oversized,
            UtmMedium: oversized));

        result.UtmSource.Should().HaveLength(100);
        result.UtmCampaign.Should().HaveLength(100);
        result.UtmContent.Should().HaveLength(100);
        result.UtmTerm.Should().HaveLength(100);
        result.UtmMedium.Should().HaveLength(100);
    }

    [Fact]
    public void Classify_OversizedReferrerHost_IsTruncatedTo255Chars()
    {
        // Many short, DNS-valid labels so System.Uri accepts the host, but the total length still
        // exceeds the 255-char storage limit.
        string longHost = string.Concat(Enumerable.Repeat("ab.", 100)) + "example.com";
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: $"https://{longHost}/",
            RequestHost: "www.quizymode.com"));

        result.ReferrerHost.Should().NotBeNull();
        result.ReferrerHost!.Length.Should().Be(255);
    }

    [Fact]
    public void Classify_UnparsableReferrer_DoesNotThrowAndIsTreatedAsAbsent()
    {
        AttributionResult result = _classifier.Classify(new AttributionRequest(
            ReferrerUrl: "not a url",
            RequestHost: "www.quizymode.com"));

        result.ReferrerHost.Should().BeNull();
        result.Channel.Should().Be("direct");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ClassifyDeviceClass_MissingUserAgent_IsUnknown(string? userAgent)
    {
        _classifier.ClassifyDeviceClass(userAgent).Should().Be("unknown");
    }

    [Theory]
    [InlineData("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")]
    public void ClassifyDeviceClass_MobileUserAgent_IsMobile(string userAgent)
    {
        _classifier.ClassifyDeviceClass(userAgent).Should().Be("mobile");
    }

    [Theory]
    [InlineData("Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")]
    [InlineData("Mozilla/5.0 (Linux; Android 14; SM-T870) AppleWebKit/537.36 Tablet Safari/537.36")]
    public void ClassifyDeviceClass_TabletUserAgent_IsTablet(string userAgent)
    {
        _classifier.ClassifyDeviceClass(userAgent).Should().Be("tablet");
    }

    [Theory]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0")]
    public void ClassifyDeviceClass_DesktopUserAgent_IsDesktop(string userAgent)
    {
        _classifier.ClassifyDeviceClass(userAgent).Should().Be("desktop");
    }
}
