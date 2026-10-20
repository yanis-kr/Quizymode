using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideDocuments.Generation;

internal sealed record ChatCompletionRequest(string SystemPrompt, string UserPrompt, int MaxTokens, double Temperature);

/// <summary>
/// Outcome of one vendor call. <see cref="Content"/> is set only on <see cref="LlmAttemptOutcome.Success"/>.
/// <see cref="HttpStatus"/> is the status of every response that was received (including 2xx replies that turn out to
/// be invalid); it is null when no response arrived: vendor not configured, timeout, <see cref="HttpRequestException"/>,
/// or a body read that failed after the headers.
/// </summary>
internal sealed record ChatCompletionResult(
    LlmAttemptOutcome Outcome,
    string? Content,
    int? InputTokens,
    int? OutputTokens,
    int DurationMs,
    int? HttpStatus = null);

internal interface IOpenAiCompatibleChatClient
{
    Task<ChatCompletionResult> CompleteAsync(
        LlmVendorEndpoint endpoint,
        string model,
        ChatCompletionRequest request,
        CancellationToken cancellationToken);
}

/// <summary>
/// One typed HttpClient for every OpenAI-compatible chat completions API (DeepSeek, OpenAI, Gemini): POST
/// <c>{baseUrl}/chat/completions</c> with a Bearer key, JSON mode (<c>response_format: json_object</c>), low temperature,
/// and capped output tokens. OpenAI reasoning models (gpt-5*, o-series) get <c>max_completion_tokens</c> and no
/// temperature, which those models require. The Authorization header is redacted from HTTP logs and keys are never logged.
/// </summary>
internal sealed class OpenAiCompatibleChatClient(HttpClient httpClient, ILogger<OpenAiCompatibleChatClient> logger)
    : IOpenAiCompatibleChatClient
{
    private readonly HttpClient _httpClient = httpClient;
    private readonly ILogger<OpenAiCompatibleChatClient> _logger = logger;
    private const int MaxErrorExcerptLength = 300;

    public async Task<ChatCompletionResult> CompleteAsync(
        LlmVendorEndpoint endpoint,
        string model,
        ChatCompletionRequest request,
        CancellationToken cancellationToken)
    {
        Stopwatch stopwatch = Stopwatch.StartNew();
        if (!endpoint.IsConfigured)
        {
            return new ChatCompletionResult(LlmAttemptOutcome.ProviderError, null, null, null, 0);
        }

        using HttpRequestMessage httpRequest = new(HttpMethod.Post, $"{endpoint.BaseUrl.TrimEnd('/')}/chat/completions")
        {
            Content = JsonContent.Create(BuildRequestBody(endpoint.Vendor, model, request))
        };
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", endpoint.ApiKey);

        try
        {
            using HttpResponseMessage response = await _httpClient.SendAsync(httpRequest, cancellationToken);
            string responseText = await response.Content.ReadAsStringAsync(cancellationToken);
            int elapsed = (int)stopwatch.ElapsedMilliseconds;
            int status = (int)response.StatusCode;
            if (!response.IsSuccessStatusCode)
            {
                LlmAttemptOutcome failure = ClassifyFailure(status, responseText);
                if (failure == LlmAttemptOutcome.AuthError)
                {
                    // Vendors echo a masked key fragment in auth errors (AC 5.12.5), so the body is never logged.
                    _logger.LogWarning(
                        "StudyGuideGeneration: {Vendor} rejected the API key (HTTP {StatusCode}).",
                        endpoint.Vendor,
                        status);
                }
                else
                {
                    _logger.LogWarning(
                        "StudyGuideGeneration: {Vendor} returned {StatusCode}: {Error}",
                        endpoint.Vendor,
                        status,
                        ErrorExcerpt(responseText));
                }

                return new ChatCompletionResult(failure, null, null, null, elapsed, status);
            }

            return ReadCompletion(endpoint.Vendor, responseText, elapsed, status);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("StudyGuideGeneration: {Vendor} request timed out.", endpoint.Vendor);
            return new ChatCompletionResult(LlmAttemptOutcome.Timeout, null, null, null, (int)stopwatch.ElapsedMilliseconds);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning("StudyGuideGeneration: {Vendor} request failed: {Error}", endpoint.Vendor, ex.Message);
            return new ChatCompletionResult(LlmAttemptOutcome.ProviderError, null, null, null, (int)stopwatch.ElapsedMilliseconds);
        }
    }

    internal static JsonObject BuildRequestBody(string vendor, string model, ChatCompletionRequest request)
    {
        JsonObject body = new()
        {
            ["model"] = model,
            ["messages"] = new JsonArray(
                new JsonObject { ["role"] = "system", ["content"] = request.SystemPrompt },
                new JsonObject { ["role"] = "user", ["content"] = request.UserPrompt }),
            ["response_format"] = new JsonObject { ["type"] = "json_object" },
            ["stream"] = false
        };

        if (vendor == LlmVendors.OpenAI && IsOpenAiReasoningModel(model))
        {
            body["max_completion_tokens"] = request.MaxTokens;
            // Without this, reasoning can use the whole completion budget before any answer is written.
            body["reasoning_effort"] = ReasoningEffortFor(model);
        }
        else
        {
            body["temperature"] = request.Temperature;
            body["max_tokens"] = request.MaxTokens;
        }

        return body;
    }

    /// <summary>The lowest effort each reasoning family accepts: gpt-5 models take "minimal", o-series models "low".</summary>
    internal static string ReasoningEffortFor(string model) =>
        model.Trim().StartsWith("gpt-5", StringComparison.OrdinalIgnoreCase) ? "minimal" : "low";

    /// <summary>
    /// Maps a non-2xx reply to an outcome: 401/403 are <see cref="LlmAttemptOutcome.AuthError"/>, and so is a 400 whose
    /// body mentions an API key (Gemini answers a bad key with 400 "API key not valid"). Everything else is a provider error.
    /// </summary>
    internal static LlmAttemptOutcome ClassifyFailure(int status, string body) =>
        status is 401 or 403 ||
        (status == 400 && body.Contains("API key", StringComparison.OrdinalIgnoreCase))
            ? LlmAttemptOutcome.AuthError
            : LlmAttemptOutcome.ProviderError;

    private static readonly Regex[] KeyLikePatterns =
    [
        new(@"sk-[A-Za-z0-9_\-*]{4,}", RegexOptions.Compiled),
        new(@"AIza[0-9A-Za-z_\-]{8,}", RegexOptions.Compiled),
        new(@"\*+[A-Za-z0-9]{3,6}", RegexOptions.Compiled)
    ];

    /// <summary>
    /// A short, single-line excerpt of a vendor error body for the log. Vendor errors describe the problem
    /// (bad key, unknown field, quota); they don't echo our request, so nothing from the study guide is logged.
    /// Anything shaped like an API key (or a masked key fragment) is redacted as a second layer.
    /// </summary>
    internal static string ErrorExcerpt(string responseText)
    {
        string redacted = KeyLikePatterns.Aggregate(responseText, (text, pattern) => pattern.Replace(text, "[redacted]"));
        string singleLine = string.Join(' ', redacted.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return singleLine.Length <= MaxErrorExcerptLength ? singleLine : singleLine[..MaxErrorExcerptLength] + "…";
    }

    internal static bool IsOpenAiReasoningModel(string model)
    {
        string normalized = model.Trim().ToLowerInvariant();
        return normalized.StartsWith("gpt-5", StringComparison.Ordinal) ||
               (normalized.Length > 1 && normalized[0] == 'o' && char.IsDigit(normalized[1]));
    }

    private ChatCompletionResult ReadCompletion(string vendor, string responseText, int elapsed, int status)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(responseText);
            JsonElement root = document.RootElement;
            (int? inputTokens, int? outputTokens) = ReadUsage(root);

            if (!root.TryGetProperty("choices", out JsonElement choices) ||
                choices.ValueKind != JsonValueKind.Array ||
                choices.GetArrayLength() == 0)
            {
                return new ChatCompletionResult(LlmAttemptOutcome.InvalidJson, null, inputTokens, outputTokens, elapsed, status);
            }

            JsonElement choice = choices[0];
            string? finishReason = choice.TryGetProperty("finish_reason", out JsonElement finish) && finish.ValueKind == JsonValueKind.String
                ? finish.GetString()
                : null;

            if (finishReason == "content_filter")
            {
                _logger.LogInformation("StudyGuideGeneration: {Vendor} declined the request (content_filter).", vendor);
                return new ChatCompletionResult(LlmAttemptOutcome.ContentFilter, null, inputTokens, outputTokens, elapsed, status);
            }

            if (finishReason == "length")
            {
                _logger.LogWarning("StudyGuideGeneration: {Vendor} reply hit the output token limit.", vendor);
                return new ChatCompletionResult(LlmAttemptOutcome.InvalidJson, null, inputTokens, outputTokens, elapsed, status);
            }

            string content = choice.TryGetProperty("message", out JsonElement message) &&
                             message.ValueKind == JsonValueKind.Object &&
                             message.TryGetProperty("content", out JsonElement contentElement) &&
                             contentElement.ValueKind == JsonValueKind.String
                ? (contentElement.GetString() ?? string.Empty).Trim()
                : string.Empty;

            return content.Length == 0
                ? new ChatCompletionResult(LlmAttemptOutcome.InvalidJson, null, inputTokens, outputTokens, elapsed, status)
                : new ChatCompletionResult(LlmAttemptOutcome.Success, content, inputTokens, outputTokens, elapsed, status);
        }
        catch (JsonException)
        {
            _logger.LogWarning("StudyGuideGeneration: {Vendor} response was not valid JSON.", vendor);
            return new ChatCompletionResult(LlmAttemptOutcome.InvalidJson, null, null, null, elapsed, status);
        }
    }

    private static (int? Input, int? Output) ReadUsage(JsonElement root)
    {
        if (!root.TryGetProperty("usage", out JsonElement usage) || usage.ValueKind != JsonValueKind.Object)
        {
            return (null, null);
        }

        int? input = usage.TryGetProperty("prompt_tokens", out JsonElement prompt) && prompt.ValueKind == JsonValueKind.Number && prompt.TryGetInt32(out int promptTokens)
            ? promptTokens
            : null;
        int? output = usage.TryGetProperty("completion_tokens", out JsonElement completion) && completion.ValueKind == JsonValueKind.Number && completion.TryGetInt32(out int completionTokens)
            ? completionTokens
            : null;
        return (input, output);
    }
}
