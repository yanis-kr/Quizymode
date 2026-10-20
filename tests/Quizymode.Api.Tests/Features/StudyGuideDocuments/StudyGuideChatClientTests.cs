using System.Net;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Quizymode.Api.Features.StudyGuideDocuments.Generation;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.Features.StudyGuideUploads;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

/// <summary>Vendor reply classification, the HTTP status carried on every received reply, and log hygiene (AC 5.12.5, 6.6.12).</summary>
public sealed class StudyGuideChatClientTests
{
    private const string GeminiBadKeyBody = "[{\"error\":{\"code\":400,\"message\":\"API key not valid. Please pass a valid API key.\",\"status\":\"INVALID_ARGUMENT\"}}]";
    private const string OpenAiBadKeyBody = "{\"error\":{\"message\":\"Incorrect API key provided: sk-proj-****abcd. You can find your API key at https://platform.openai.com.\",\"type\":\"invalid_request_error\"}}";
    private const string DeepSeekBadKeyBody = "{\"error\":{\"message\":\"Authentication Fails, Your api key: ****abcd is invalid\",\"type\":\"authentication_error\"}}";

    private sealed class CapturingLogger : ILogger<OpenAiCompatibleChatClient>
    {
        public List<string> Messages { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Messages.Add(formatter(state, exception));
    }

    private static async Task<ChatCompletionResult> CallAsync(Func<HttpRequestMessage, string, HttpResponseMessage> respond, CapturingLogger? logger = null)
    {
        OpenAiCompatibleChatClient client = new(new HttpClient(new FakeDeepSeekHandler(respond)), logger ?? new CapturingLogger());
        return await client.CompleteAsync(
            new LlmVendorEndpoint(LlmVendors.OpenAI, "https://api.openai.com/v1", "test-key"),
            "gpt-5-nano",
            new ChatCompletionRequest("system", "user", 1000, 0.2),
            CancellationToken.None);
    }

    private static HttpResponseMessage Body(HttpStatusCode status, string body) => FakeDeepSeekHandler.Json(status, body);

    [Theory]
    [InlineData(401, "{}", LlmAttemptOutcome.AuthError, 401)]
    [InlineData(403, "{}", LlmAttemptOutcome.AuthError, 403)]
    [InlineData(400, GeminiBadKeyBody, LlmAttemptOutcome.AuthError, 400)]
    [InlineData(400, "{\"error\":\"unknown field\"}", LlmAttemptOutcome.ProviderError, 400)]
    [InlineData(500, "{\"error\":\"boom\"}", LlmAttemptOutcome.ProviderError, 500)]
    [InlineData(429, "{\"error\":\"slow down\"}", LlmAttemptOutcome.ProviderError, 429)]
    public async Task ChatClient_ClassifiesFailedResponses(int status, string body, LlmAttemptOutcome outcome, int expectedStatus)
    {
        ChatCompletionResult result = await CallAsync((_, _) => Body((HttpStatusCode)status, body));

        result.Outcome.Should().Be(outcome);
        result.HttpStatus.Should().Be(expectedStatus);
        result.Content.Should().BeNull();
    }

    [Fact]
    public async Task ChatClient_Timeout_HasNoHttpStatus()
    {
        ChatCompletionResult result = await CallAsync((_, _) => throw new TaskCanceledException("timeout"));

        result.Outcome.Should().Be(LlmAttemptOutcome.Timeout);
        result.HttpStatus.Should().BeNull();
    }

    [Fact]
    public async Task ChatClient_NetworkFailure_HasNoHttpStatus()
    {
        ChatCompletionResult result = await CallAsync((_, _) => throw new HttpRequestException("connection refused"));

        result.Outcome.Should().Be(LlmAttemptOutcome.ProviderError);
        result.HttpStatus.Should().BeNull();
    }

    [Fact]
    public async Task ChatClient_NoApiKey_HasNoHttpStatus()
    {
        OpenAiCompatibleChatClient client = new(new HttpClient(new FakeDeepSeekHandler((_, _) => throw new InvalidOperationException())), new CapturingLogger());

        ChatCompletionResult result = await client.CompleteAsync(
            new LlmVendorEndpoint(LlmVendors.OpenAI, "https://api.openai.com/v1", ""),
            "gpt-5-nano",
            new ChatCompletionRequest("system", "user", 1000, 0.2),
            CancellationToken.None);

        result.Outcome.Should().Be(LlmAttemptOutcome.ProviderError);
        result.HttpStatus.Should().BeNull();
    }

    [Fact]
    public async Task ChatClient_SuccessCarriesStatus200()
    {
        ChatCompletionResult result = await CallAsync((_, _) => FakeVendorHandler.Completion("{\"questions\":[]}"));

        result.Outcome.Should().Be(LlmAttemptOutcome.Success);
        result.HttpStatus.Should().Be(200);
    }

    [Fact]
    public async Task ChatClient_InvalidJsonBody_IsInvalidJsonWithStatus200()
    {
        ChatCompletionResult result = await CallAsync((_, _) => Body(HttpStatusCode.OK, "<html>not json</html>"));

        result.Outcome.Should().Be(LlmAttemptOutcome.InvalidJson);
        result.HttpStatus.Should().Be(200);
    }

    [Theory]
    [InlineData("{\"choices\":[]}", LlmAttemptOutcome.InvalidJson)]
    [InlineData("{\"choices\":[{\"finish_reason\":\"content_filter\",\"message\":{\"content\":\"\"}}]}", LlmAttemptOutcome.ContentFilter)]
    [InlineData("{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"{\"}}]}", LlmAttemptOutcome.InvalidJson)]
    [InlineData("{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"content\":\"  \"}}]}", LlmAttemptOutcome.InvalidJson)]
    public async Task ChatClient_Unusable200Replies_KeepStatus200(string body, LlmAttemptOutcome outcome)
    {
        ChatCompletionResult result = await CallAsync((_, _) => Body(HttpStatusCode.OK, body));

        result.Outcome.Should().Be(outcome);
        result.HttpStatus.Should().Be(200);
    }

    [Theory]
    [InlineData(401, OpenAiBadKeyBody)]
    [InlineData(401, DeepSeekBadKeyBody)]
    [InlineData(400, GeminiBadKeyBody)]
    public async Task ChatClient_AuthErrorLogs_NeverContainTheVendorBody(int status, string body)
    {
        CapturingLogger logger = new();

        await CallAsync((_, _) => Body((HttpStatusCode)status, body), logger);

        string log = string.Join('\n', logger.Messages);
        log.Should().Contain("OpenAI").And.Contain(status.ToString());
        log.Should().NotContain("abcd").And.NotContain("sk-").And.NotContain("Incorrect API key").And.NotContain("Authentication Fails").And.NotContain("API key not valid");
    }

    [Fact]
    public async Task ChatClient_ServerErrorLog_RedactsKeyLikeStrings()
    {
        CapturingLogger logger = new();
        string body = "{\"error\":\"upstream failure for sk-proj-AbCdEf123456 and AIzaSyA1B2C3D4E5F6 and ****wxyz\"}";

        await CallAsync((_, _) => Body(HttpStatusCode.InternalServerError, body), logger);

        string log = string.Join('\n', logger.Messages);
        log.Should().Contain("upstream failure").And.Contain("[redacted]");
        log.Should().NotContain("AbCdEf123456").And.NotContain("AIzaSy").And.NotContain("wxyz");
    }

    [Theory]
    [InlineData("key sk-proj-****abcd here", "key [redacted] here")]
    [InlineData("key sk-abc123 here", "key [redacted] here")]
    [InlineData("Your api key: ****abcd is invalid", "Your api key: [redacted] is invalid")]
    [InlineData("AIzaSyDUMMYKEY123456", "[redacted]")]
    [InlineData("quota exceeded for model", "quota exceeded for model")]
    public void ErrorExcerpt_RedactsKeyShapedText(string input, string expected)
    {
        OpenAiCompatibleChatClient.ErrorExcerpt(input).Should().Be(expected);
    }

    [Fact]
    public void ErrorExcerpt_RedactsBeforeTruncating()
    {
        string input = new string('x', 294) + " sk-proj-SECRETKEYSECRET";

        // "sk-pr" ends exactly at character 300, so truncate-then-redact would leak the "sk-pr" prefix.
        OpenAiCompatibleChatClient.ErrorExcerpt(input).Should().NotContain("SECRET").And.NotContain("sk-");
    }
}
