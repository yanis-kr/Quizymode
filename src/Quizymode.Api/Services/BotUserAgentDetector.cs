namespace Quizymode.Api.Services;

/// <summary>
/// Classifies a request user-agent as automated (crawler, scraper, monitor) or human.
/// Bot traffic is overwhelmingly single-page, so leaving it in makes anonymous
/// engagement metrics look like nothing but one-off page checks.
/// </summary>
internal static class BotUserAgentDetector
{
    private static readonly string[] BotMarkers =
    [
        // Generic crawler vocabulary
        "bot",
        "crawl",
        "spider",
        "slurp",
        "scrape",
        "fetcher",
        "archiver",

        // Headless browsers and scripted clients
        "headlesschrome",
        "phantomjs",
        "puppeteer",
        "playwright",
        "selenium",
        "python-requests",
        "python-urllib",
        "go-http-client",
        "java/",
        "okhttp",
        "axios/",
        "node-fetch",
        "curl",
        "wget",
        "libwww-perl",
        "httpclient",

        // Link unfurlers and social previews
        "facebookexternalhit",
        "slackbot",
        "discordbot",
        "telegrambot",
        "whatsapp",
        "embedly",
        "quora link preview",
        "skypeuripreview",

        // Named AI and SEO crawlers that omit the generic markers above
        "gptbot",
        "oai-searchbot",
        "chatgpt-user",
        "claudebot",
        "claude-web",
        "anthropic-ai",
        "perplexitybot",
        "ahrefs",
        "semrush",
        "mj12",
        "dotbot",
        "dataforseo",

        // Uptime and monitoring probes
        "pingdom",
        "uptimerobot",
        "statuscake",
        "site24x7",
        "newrelicpinger",
        "lighthouse",
        "gtmetrix"
    ];

    /// <summary>
    /// Returns true when the user-agent matches a known automated client.
    /// A missing user-agent is treated as human: page-view rows recorded before
    /// user-agent capture existed have none, and flagging them as bots would
    /// silently rewrite historical analytics.
    /// </summary>
    public static bool IsBot(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
        {
            return false;
        }

        string normalized = userAgent.ToLowerInvariant();

        foreach (string marker in BotMarkers)
        {
            if (normalized.Contains(marker, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
