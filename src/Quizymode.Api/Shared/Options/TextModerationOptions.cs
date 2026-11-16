namespace Quizymode.Api.Shared.Options;

internal sealed record class TextModerationOptions
{
    public const string SectionName = "TextModeration";

    public string ModerationTermsPath { get; init; } = "data/moderation/text-moderation-terms.json";
}
