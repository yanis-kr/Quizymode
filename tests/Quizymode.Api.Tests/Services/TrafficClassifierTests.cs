using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>#573: the write-time traffic class and the anchored E2E token.</summary>
public sealed class TrafficClassifierTests
{
    public static TheoryData<string> RealBrowserUserAgents => new()
    {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
        "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1234",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.0.0;FBBV/0;FBDV/iPhone15,2]"
    };

    [Theory]
    [MemberData(nameof(RealBrowserUserAgents))]
    public void RealBrowserUserAgents_AreAudience_NeverAutomated(string userAgent)
    {
        TrafficClassifier.HasE2EToken(userAgent).Should().BeFalse();
        TrafficClassifier.Classify(userAgent, isMaintainer: false).Should().Be(TrafficClassifier.Audience);
    }

    [Theory]
    [InlineData("Mozilla/5.0 Chrome/126.0 QuizymodeE2E/local")]
    [InlineData("Mozilla/5.0 Chrome/126.0 QuizymodeE2E/123456789")]
    [InlineData("Mozilla/5.0 Chrome/126.0 QuizymodeE2E/a.b_c-1")]
    [InlineData("QuizymodeE2E/x")]
    public void ExactTokenAtTheEnd_IsAutomated(string userAgent)
    {
        TrafficClassifier.Classify(userAgent, isMaintainer: false).Should().Be(TrafficClassifier.Automated);
    }

    [Theory]
    [InlineData("Mozilla/5.0 QuizymodeE2E/")]
    [InlineData("Mozilla/5.0 QuizymodeE2E/bad token")]
    [InlineData("Mozilla/5.0 QuizymodeE2E/bad!")]
    [InlineData("Mozilla/5.0 XQuizymodeE2E/ok")]
    [InlineData("Mozilla/5.0 quizymodee2e/ok")]
    [InlineData("Mozilla/5.0 QuizymodeE2E/ok Chrome/126.0")]
    [InlineData("Mozilla/5.0 QuizymodeE2E/ok\n")]
    public void MalformedOrMisplacedTokens_AreNotAutomated(string userAgent)
    {
        TrafficClassifier.HasE2EToken(userAgent).Should().BeFalse();
        TrafficClassifier.Classify(userAgent, isMaintainer: false).Should().Be(TrafficClassifier.Audience);
    }

    [Fact]
    public void Token_OfFortyCharactersIsAutomated_FortyOneIsNot()
    {
        TrafficClassifier.HasE2EToken("Mozilla/5.0 QuizymodeE2E/" + new string('a', 40)).Should().BeTrue();
        TrafficClassifier.HasE2EToken("Mozilla/5.0 QuizymodeE2E/" + new string('a', 41)).Should().BeFalse();
    }

    [Fact]
    public void Precedence_AutomatedThenKnownBotThenMaintainerThenAudience()
    {
        TrafficClassifier.Classify("HeadlessChrome/126.0 QuizymodeE2E/run-1", isMaintainer: true).Should().Be(TrafficClassifier.Automated);
        TrafficClassifier.Classify("Googlebot/2.1", isMaintainer: true).Should().Be(TrafficClassifier.KnownBot);
        TrafficClassifier.Classify("Mozilla/5.0 Chrome/126.0", isMaintainer: true).Should().Be(TrafficClassifier.Maintainer);
        TrafficClassifier.Classify(null, isMaintainer: false).Should().Be(TrafficClassifier.Audience);
    }

    [Fact]
    public void LegacyInternalFlag_IsTrueForMaintainerAndAutomatedOnly()
    {
        TrafficClassifier.IsInternalClass(TrafficClassifier.Maintainer).Should().BeTrue();
        TrafficClassifier.IsInternalClass(TrafficClassifier.Automated).Should().BeTrue();
        TrafficClassifier.IsInternalClass(TrafficClassifier.KnownBot).Should().BeFalse();
        TrafficClassifier.IsInternalClass(TrafficClassifier.Audience).Should().BeFalse();
    }
}
