namespace Quizymode.Api.Services;

/// <summary>
/// Validates text against a profanity filter (e.g. for keyword names).
/// Implemented using an external library (DotnetBadWordDetector).
/// </summary>
public interface IProfanityFilterService
{
    /// <summary>
    /// Returns true if the text contains profanity and should be rejected.
    /// </summary>
    bool ContainsProfanity(string text);
}
