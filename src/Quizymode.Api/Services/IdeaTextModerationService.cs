using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Services;

internal sealed partial class IdeaTextModerationService(
    IWebHostEnvironment environment,
    IOptions<IdeaAbuseProtectionOptions> options,
    ILogger<IdeaTextModerationService> logger) : ITextModerationService
{
    private static readonly string[] DefaultBlockedTerms =
    [
        "fuck",
        "shit",
        "bitch",
        "asshole",
        "slut"
    ];

    private static readonly string[] DefaultSuspiciousTerms =
    [
        "buy now",
        "cheap pills",
        "crypto giveaway",
        "telegram",
        "whatsapp",
        "casino"
    ];

    private readonly string _contentRootPath = environment.ContentRootPath;
    private readonly IdeaAbuseProtectionOptions _options = options.Value;
    private readonly ILogger<IdeaTextModerationService> _logger = logger;
    private volatile ModerationTerms? _cachedTerms;

    public TextModerationResult Evaluate(params string?[] values)
    {
        string normalized = NormalizeForDetection(string.Join(' ', values.Where(static value => !string.IsNullOrWhiteSpace(value))));
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return new TextModerationResult(TextModerationOutcome.Clean);
        }

        ModerationTerms terms = GetTerms();
        foreach (string term in terms.BlockedTerms)
        {
            if (ContainsTerm(normalized, term))
            {
                return new TextModerationResult(TextModerationOutcome.Blocked, term);
            }
        }

        foreach (string term in terms.SuspiciousTerms)
        {
            if (ContainsTerm(normalized, term))
            {
                return new TextModerationResult(TextModerationOutcome.Suspicious, term);
            }
        }

        return new TextModerationResult(TextModerationOutcome.Clean);
    }

    private ModerationTerms GetTerms()
    {
        if (_cachedTerms is not null)
        {
            return _cachedTerms;
        }

        string configuredPath = _options.ModerationTermsPath;
        string resolvedPath = Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.GetFullPath(Path.Combine(_contentRootPath, configuredPath));

        try
        {
            if (File.Exists(resolvedPath))
            {
                string json = File.ReadAllText(resolvedPath);
                ModerationTerms? loaded = JsonSerializer.Deserialize<ModerationTerms>(
                    json,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (loaded is not null)
                {
                    _cachedTerms = new ModerationTerms(
                        NormalizeTerms(loaded.BlockedTerms, DefaultBlockedTerms),
                        NormalizeTerms(loaded.SuspiciousTerms, DefaultSuspiciousTerms));
                    return _cachedTerms;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load idea moderation terms from {Path}. Falling back to defaults.", resolvedPath);
        }

        _cachedTerms = new ModerationTerms(
            NormalizeTerms(null, DefaultBlockedTerms),
            NormalizeTerms(null, DefaultSuspiciousTerms));
        return _cachedTerms;
    }

    private static string[] NormalizeTerms(IEnumerable<string>? values, IEnumerable<string> fallback)
    {
        IEnumerable<string> source = values is null || !values.Any()
            ? fallback
            : values;

        return source
            .Select(NormalizeForDetection)
            .Where(static value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    private static bool ContainsTerm(string normalizedText, string normalizedTerm)
    {
        if (normalizedTerm.Contains(' ', StringComparison.Ordinal))
        {
            return normalizedText.Contains(normalizedTerm, StringComparison.Ordinal);
        }

        return WordBoundaryRegex(normalizedTerm).IsMatch(normalizedText);
    }

    private static string NormalizeForDetection(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return MultiWhitespaceRegex()
            .Replace(NonLetterNumberRegex().Replace(value.ToLowerInvariant(), " "), " ")
            .Trim();
    }

    [GeneratedRegex(@"[^a-z0-9\s]+", RegexOptions.Compiled)]
    private static partial Regex NonLetterNumberRegex();

    [GeneratedRegex(@"\s+", RegexOptions.Compiled)]
    private static partial Regex MultiWhitespaceRegex();

    private static Regex WordBoundaryRegex(string value) =>
        new($@"\b{Regex.Escape(value)}\b", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private sealed record ModerationTerms(
        string[] BlockedTerms,
        string[] SuspiciousTerms);
}
