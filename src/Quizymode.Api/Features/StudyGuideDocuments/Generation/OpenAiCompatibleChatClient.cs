using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideDocuments.Generation;

internal sealed record ChatCompletionRequest(string SystemPrompt, string UserPrompt, int MaxTokens, double Temperature);

/// <summary>Outcome of one vendor call. <see cref="Content"/> is set only on <see cref="LlmAttemptOutcome.Success"/>.</summary>
internal sealed record ChatCompletionResult(
    LlmAttemptOutcome Outcome,
    string? Content,
    int? InputTokens,
    int? OutputTokens,
    int DurationMs);

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
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "StudyGuideGeneration: {Vendor} returned {StatusCode}.",
                    endpoint.Vendor,
                    (int)response.StatusCode);
                return new ChatCompletionResult(LlmAttemptOutcome.ProviderError, null, null, null, elapsed);
            }

            return ReadCompletion(endpoint.Vendor, responseText, elapsed);
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
        }
        else
        {
            body["temperature"] = request.Temperature;
            body["max_tokens"] = request.MaxTokens;
        }

        return body;
    }

    internal static bool IsOpenAiReasoningModel(string model)
    {
        string normalized = model.Trim().ToLowerInvariant();
        return normalized.StartsWith("gpt-5", StringComparison.Ordinal) ||
               (normalized.Length > 1 && normalized[0] == 'o' && char.IsDigit(normalized[1]));
    }

    private ChatCompletionResult ReadCompletion(string vendor, string responseText, int elapsed)
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
                return new ChatCompletionResult(LlmAttemptOutcome.InvalidJson, null, inputTokens, outputTokens, elapsed);
            }

            JsonElement choice = choices[0];
            string? finishReason = choice.TryGetProperty("finish_reason", out JsonElement finish) && finish.ValueKind == JsonValueKind.String
                ? finish.GetString()
                : null;

            if (finishReason == "content_filter")
            {
                _logger.LogInformation("StudyGuideGeneration: {Vendor} declined the request (content_filter).", vendor);
                return new ChatCompletionResult(LlmAttemptOutcome.ContentFilter, null, inputTokens, outputTokens, elapsed);
            }

            if (finishReason == "length")
            {
                _logger.LogWarning("StudyGuideGeneration: {Vendor} reply hit the output token limit.", vendor);
                return new ChatCompletionResult(LlmAttemptOutcome.InvalidJson, null, inputTokens, outputTokens, elapsed);
            }

            string content = choice.TryGetProperty("message", out JsonElement message) &&
                             message.ValueKind == JsonValueKind.Object &&
                             message.TryGetProperty("content", out JsonElement contentElement) &&
                             contentElement.ValueKind == JsonValueKind.String
                ? (contentElement.GetString() ?? string.Empty).Trim()
                : string.Empty;

            return content.Length == 0
                ? new ChatCompletionResult(LlmAttemptOutcome.InvalidJson, null, inputTokens, outputTokens, elapsed)
                : new ChatCompletionResult(LlmAttemptOutcome.Success, content, inputTokens, outputTokens, elapsed);
        }
        catch (JsonException)
        {
            _logger.LogWarning("StudyGuideGeneration: {Vendor} response was not valid JSON.", vendor);
            return new ChatCompletionResult(LlmAttemptOutcome.InvalidJson, null, null, null, elapsed);
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
