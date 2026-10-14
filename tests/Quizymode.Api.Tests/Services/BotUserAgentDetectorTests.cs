using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class BotUserAgentDetectorTests
{
    [Theory]
    [InlineData("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")]
    [InlineData("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")]
    [InlineData("Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)")]
    [InlineData("Mozilla/5.0 (compatible; SemrushBot/7~bl)")]
    [InlineData("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36")]
    [InlineData("python-requests/2.31.0")]
    [InlineData("curl/8.4.0")]
    [InlineData("facebookexternalhit/1.1")]
    [InlineData("Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)")]
    [InlineData("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")]
    [InlineData("Slurp")]
    [InlineData("UptimeRobot/2.0")]
    public void IsBot_DetectsAutomatedClients(string userAgent)
    {
        BotUserAgentDetector.IsBot(userAgent).Should().BeTrue();
    }

    [Theory]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")]
    [InlineData("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")]
    [InlineData("Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0")]
    public void IsBot_AllowsRealBrowsers(string userAgent)
    {
        BotUserAgentDetector.IsBot(userAgent).Should().BeFalse();
    }

    [Fact]
    public void IsBot_IsCaseInsensitive()
    {
        BotUserAgentDetector.IsBot("GOOGLEBOT/2.1").Should().BeTrue();
        BotUserAgentDetector.IsBot("PyThOn-ReQuEsTs/2.31.0").Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void IsBot_TreatsMissingUserAgentAsHuman(string? userAgent)
    {
        // Page views recorded before user-agent capture existed have no user agent.
        // Flagging them as bots would silently rewrite historical analytics.
        BotUserAgentDetector.IsBot(userAgent).Should().BeFalse();
    }
}
