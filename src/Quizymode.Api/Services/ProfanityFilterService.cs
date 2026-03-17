using DotnetBadWordDetector;

namespace Quizymode.Api.Services;

/// <summary>
/// Profanity filter using DotnetBadWordDetector (external library).
/// Detector is kept in memory for performance.
/// </summary>
public sealed class ProfanityFilterService : IProfanityFilterService
{
    private readonly ProfanityDetector _detector = new(allLocales: false);

    public bool ContainsProfanity(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return false;
        return _detector.IsPhraseProfane(text.Trim());
    }
}
