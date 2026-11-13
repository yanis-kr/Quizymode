using System.Text.RegularExpressions;

namespace Quizymode.Api.Services;

/// <summary>
/// Write-time traffic class (#573). Precedence: automated, then known_bot, then maintainer, then audience.
/// Reports exclude every class except <see cref="Audience"/> and count the others separately.
/// </summary>
internal static partial class TrafficClassifier
{
    public const string Audience = "audience";
    public const string Maintainer = "maintainer";
    public const string Automated = "automated";
    public const string KnownBot = "known_bot";

    /// <summary>Read-time label for historical rows whose only evidence is the legacy internal flag.</summary>
    public const string InternalUnsplit = "internal (unsplit)";

    public const int MaxLength = 16;

    /// <summary>
    /// Exact E2E token at the very end of the user agent. A spoofed token only removes the sender's own traffic,
    /// the same as the internal-browser marker; it never grants rights.
    /// </summary>
    [GeneratedRegex(@"(?:^|\s)QuizymodeE2E/[A-Za-z0-9._-]{1,40}\z", RegexOptions.CultureInvariant)]
    private static partial Regex E2ETokenPattern();

    public static bool HasE2EToken(string? userAgent) =>
        !string.IsNullOrEmpty(userAgent) && E2ETokenPattern().IsMatch(userAgent);

    /// <summary>The class of one request. <paramref name="isMaintainer"/> is admin, a user flagged internal, or the internal-browser marker.</summary>
    public static string Classify(string? userAgent, bool isMaintainer)
    {
        if (HasE2EToken(userAgent))
        {
            return Automated;
        }

        if (BotUserAgentDetector.IsBot(userAgent))
        {
            return KnownBot;
        }

        return isMaintainer ? Maintainer : Audience;
    }

    /// <summary>The legacy IsInternal flag is true for maintainer and automated traffic.</summary>
    public static bool IsInternalClass(string trafficClass) =>
        trafficClass is Maintainer or Automated;
}
