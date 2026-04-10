namespace Quizymode.Api.Shared.Options;

internal sealed record class IdeaAbuseProtectionOptions
{
    public const string SectionName = "IdeaAbuseProtection";

    public int CreateDailyLimit { get; init; } = 5;

    public string ModerationTermsPath { get; init; } = "data/moderation/idea-moderation-terms.json";
}
