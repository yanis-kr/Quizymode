using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Features.StudyGuideUploads;
using Quizymode.Api.Shared.Options;
using Xunit;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace Quizymode.Api.Tests.Features.StudyGuideUploads;

public sealed class AnthropicQuestionGeneratorTests
{
    private static readonly QuestionGenerationRequest Request = new("Photosynthesis converts light to chemical energy.", "Science", "biology", "plants", 20);

    private static AnthropicQuestionGenerator Create(FakeAnthropicHandler handler, string apiKey = "test-key") =>
        new(
            new HttpClient(handler),
            MsOptions.Create(new AnthropicOptions { ApiKey = apiKey, Model = "claude-haiku-5-5" }),
            NullLogger<AnthropicQuestionGenerator>.Instance);

    [Fact]
    public async Task GenerateAsync_SendsMessagesRequestAndReturnsText()
    {
        string questions = StudyGuideUploadTestData.QuestionsJson(2);
        FakeAnthropicHandler handler = FakeAnthropicHandler.ReturningText(questions);

        QuestionGenerationResult result = await Create(handler).GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.RawText.Should().Be(questions);

        handler.Requests.Should().ContainSingle();
        (HttpRequestMessage request, string body) = handler.Requests[0];
        request.RequestUri!.ToString().Should().Be("https://api.anthropic.com/v1/messages");
        request.Headers.GetValues("x-api-key").Should().Equal("test-key");
        request.Headers.GetValues("anthropic-version").Should().Equal("2023-06-01");

        using JsonDocument document = JsonDocument.Parse(body);
        JsonElement root = document.RootElement;
        root.GetProperty("model").GetString().Should().Be("claude-haiku-5-5");
        root.GetProperty("output_config").GetProperty("format").GetProperty("type").GetString().Should().Be("json_schema");
        root.GetProperty("messages")[0].GetProperty("content").GetString().Should()
            .Contain("<study_material>").And.Contain("Photosynthesis").And.Contain("Write up to 20");
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.BadRequest)]
    public async Task GenerateAsync_NonSuccessStatus_ReturnsUserSafeFailure(HttpStatusCode statusCode)
    {
        QuestionGenerationResult result = await Create(FakeAnthropicHandler.ReturningStatus(statusCode))
            .GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.FailureReason.Should().NotBeNullOrWhiteSpace();
        result.FailureReason.Should().NotContain("boom").And.NotContain("test-key");
    }

    [Fact]
    public async Task GenerateAsync_Refusal_Fails()
    {
        QuestionGenerationResult result = await Create(FakeAnthropicHandler.ReturningText("", "refusal"))
            .GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.FailureReason.Should().Contain("declined");
    }

    [Fact]
    public async Task GenerateAsync_MaxTokens_Fails()
    {
        QuestionGenerationResult result = await Create(FakeAnthropicHandler.ReturningText("{\"questions\":[", "max_tokens"))
            .GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task GenerateAsync_NetworkError_Fails()
    {
        FakeAnthropicHandler handler = new((_, _) => throw new HttpRequestException("connection refused"));

        QuestionGenerationResult result = await Create(handler).GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.FailureReason.Should().Be(AnthropicQuestionGenerator.UnavailableMessage);
    }

    [Fact]
    public async Task GenerateAsync_NoApiKey_DoesNotCallApi()
    {
        FakeAnthropicHandler handler = FakeAnthropicHandler.ReturningText("{}");

        QuestionGenerationResult result = await Create(handler, apiKey: "").GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        handler.Requests.Should().BeEmpty();
    }
}
