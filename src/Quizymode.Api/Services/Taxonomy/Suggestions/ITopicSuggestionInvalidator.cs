namespace Quizymode.Api.Services.Taxonomy.Suggestions;

/// <summary>
/// Tells topic suggestion that the public item corpus changed (a seed sync applied). It only marks the profiles stale;
/// the reload still waits for the next text suggestion and respects the daily load cap (AC 8.5).
/// </summary>
internal interface ITopicSuggestionInvalidator
{
    void Invalidate();
}

/// <summary>Default registration for hosts that do not run topic suggestion (and for tests).</summary>
internal sealed class NoOpTopicSuggestionInvalidator : ITopicSuggestionInvalidator
{
    public void Invalidate()
    {
    }
}
