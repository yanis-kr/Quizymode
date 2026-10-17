namespace Quizymode.Api.Shared.Options;

/// <summary>
/// DeepSeek chat completions (OpenAI-compatible) settings for study guide question generation.
/// <see cref="ApiKey"/> falls back to the <c>DEEPSEEK_API_KEY</c> environment variable. When no key is configured
/// the study guide upload feature is disabled (create returns 503). Never log the key.
/// </summary>
internal sealed record class DeepSeekOptions
{
    public const string SectionName = "DeepSeek";

    public const string ApiKeyEnvironmentVariable = "DEEPSEEK_API_KEY";

    public string ApiKey { get; set; } = string.Empty;

    public string BaseUrl { get; set; } = "https://api.deepseek.com/";

    public string Model { get; set; } = "deepseek-chat";

    public int MaxQuestions { get; set; } = 20;

    public int MaxTokens { get; set; } = 8000;

    public double Temperature { get; set; } = 0.2;

    public int TimeoutSeconds { get; set; } = 120;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}
