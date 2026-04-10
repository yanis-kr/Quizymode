namespace Quizymode.Api.Shared.Options;

internal sealed record class TurnstileOptions
{
    public const string SectionName = "Turnstile";

    public bool Enabled { get; init; } = false;

    public string SecretKey { get; init; } = string.Empty;

    public string VerifyEndpoint { get; init; } = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
}
