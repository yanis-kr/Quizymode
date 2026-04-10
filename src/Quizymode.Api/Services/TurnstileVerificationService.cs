using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Services;

internal sealed class TurnstileVerificationService(
    HttpClient httpClient,
    IOptions<TurnstileOptions> options,
    IWebHostEnvironment environment) : ITurnstileVerificationService
{
    private readonly HttpClient _httpClient = httpClient;
    private readonly TurnstileOptions _options = options.Value;
    private readonly IWebHostEnvironment _environment = environment;

    public async Task<TurnstileVerificationResult> VerifyAsync(
        string token,
        string? remoteIp,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return new TurnstileVerificationResult(false, "missing-input-response", "Turnstile token is required.");
        }

        if (IsLocalBypassToken(token))
        {
            return new TurnstileVerificationResult(true);
        }

        if (!_options.Enabled)
        {
            if (_environment.IsProduction())
            {
                return new TurnstileVerificationResult(false, "turnstile-disabled", "Turnstile verification is not configured.");
            }

            return new TurnstileVerificationResult(true);
        }

        if (string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            return new TurnstileVerificationResult(false, "missing-input-secret", "Turnstile secret key is not configured.");
        }

        using FormUrlEncodedContent content = new(
        [
            new KeyValuePair<string, string>("secret", _options.SecretKey),
            new KeyValuePair<string, string>("response", token),
            new KeyValuePair<string, string>("remoteip", remoteIp ?? string.Empty)
        ]);

        using HttpResponseMessage response = await _httpClient.PostAsync(
            _options.VerifyEndpoint,
            content,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return new TurnstileVerificationResult(false, "turnstile-unavailable", "Turnstile verification failed.");
        }

        SiteVerifyResponse? payload = await response.Content.ReadFromJsonAsync<SiteVerifyResponse>(cancellationToken);
        if (payload?.Success == true)
        {
            return new TurnstileVerificationResult(true);
        }

        string? errorCode = payload?.ErrorCodes?.FirstOrDefault() ?? "turnstile-verification-failed";
        return new TurnstileVerificationResult(false, errorCode, "Turnstile verification failed.");
    }

    private bool IsLocalBypassToken(string token)
    {
        if (!string.Equals(token, "dev-turnstile-bypass", StringComparison.Ordinal))
        {
            return false;
        }

        return _environment.IsDevelopment() || string.Equals(_environment.EnvironmentName, "Testing", StringComparison.OrdinalIgnoreCase);
    }

    private sealed record SiteVerifyResponse(
        [property: JsonPropertyName("success")] bool Success,
        [property: JsonPropertyName("error-codes")] string[]? ErrorCodes);
}
