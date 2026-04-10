namespace Quizymode.Api.Services;

public enum TextModerationOutcome
{
    Clean = 0,
    Suspicious = 1,
    Blocked = 2
}

public sealed record TextModerationResult(
    TextModerationOutcome Outcome,
    string? MatchingTerm = null);

public interface ITextModerationService
{
    TextModerationResult Evaluate(params string?[] values);
}
