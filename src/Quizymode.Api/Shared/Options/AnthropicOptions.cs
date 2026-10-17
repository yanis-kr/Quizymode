namespace Quizymode.Api.Shared.Options;

/// <summary>
/// Anthropic Messages API settings for study guide question generation.
/// <see cref="ApiKey"/> falls back to the <c>ANTHROPIC_API_KEY</c> environment variable. When no key is configured
/// the study guide upload feature is disabled (create returns 503). Never log the key.
/// </summary>
internal sealed record class AnthropicOptions
{
    public const string SectionName = "Anthropic";

    public const string ApiKeyEnvironmentVariable = "ANTHROPIC_API_KEY";

    public string ApiKey { get; set; } = string.Empty;

    public string BaseUrl { get; set; } = "https://api.anthropic.com/";

    public string Model { get; set; } = "claude-haiku-5-5";

    public int MaxQuestions { get; set; } = 20;

    public int MaxTokens { get; set; } = 16000;

    public int TimeoutSeconds { get; set; } = 120;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}
