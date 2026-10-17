using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Features.StudyGuideUploads;
using Quizymode.Api.Shared.Options;
using Xunit;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace Quizymode.Api.Tests.Features.StudyGuideUploads;

public sealed class DeepSeekQuestionGeneratorTests
{
    private static readonly QuestionGenerationRequest Request = new("Photosynthesis converts light to chemical energy.", "Science", "biology", "plants", 20);

    private static DeepSeekQuestionGenerator Create(FakeDeepSeekHandler handler, string apiKey = "test-key") =>
        new(
            new HttpClient(handler),
            MsOptions.Create(new DeepSeekOptions { ApiKey = apiKey }),
            NullLogger<DeepSeekQuestionGenerator>.Instance);

    [Fact]
    public async Task GenerateAsync_SendsChatCompletionRequestAndReturnsContent()
    {
        string questions = StudyGuideUploadTestData.QuestionsJson(2);
        FakeDeepSeekHandler handler = FakeDeepSeekHandler.ReturningText(questions);

        QuestionGenerationResult result = await Create(handler).GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.RawText.Should().Be(questions);

        handler.Requests.Should().ContainSingle();
        (HttpRequestMessage request, string body) = handler.Requests[0];
        request.Method.Should().Be(HttpMethod.Post);
        request.RequestUri!.ToString().Should().Be("https://api.deepseek.com/chat/completions");
        request.Headers.Authorization!.Scheme.Should().Be("Bearer");
        request.Headers.Authorization.Parameter.Should().Be("test-key");

        using JsonDocument document = JsonDocument.Parse(body);
        JsonElement root = document.RootElement;
        root.GetProperty("model").GetString().Should().Be("deepseek-chat");
        root.GetProperty("response_format").GetProperty("type").GetString().Should().Be("json_object");
        root.GetProperty("temperature").GetDouble().Should().BeLessThanOrEqualTo(0.3);
        root.GetProperty("max_tokens").GetInt32().Should().BePositive();

        JsonElement messages = root.GetProperty("messages");
        messages[0].GetProperty("role").GetString().Should().Be("system");
        messages[0].GetProperty("content").GetString().Should().Contain("json").And.Contain("\"questions\"");
        messages[1].GetProperty("role").GetString().Should().Be("user");
        messages[1].GetProperty("content").GetString().Should()
            .Contain("<study_material>").And.Contain("Photosynthesis").And.Contain("Write up to 20");
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.PaymentRequired)]
    public async Task GenerateAsync_NonSuccessStatus_ReturnsUserSafeFailure(HttpStatusCode statusCode)
    {
        QuestionGenerationResult result = await Create(FakeDeepSeekHandler.ReturningStatus(statusCode))
            .GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.FailureReason.Should().NotBeNullOrWhiteSpace();
        result.FailureReason.Should().NotContain("boom").And.NotContain("test-key");
    }

    [Fact]
    public async Task GenerateAsync_ContentFilter_Fails()
    {
        QuestionGenerationResult result = await Create(FakeDeepSeekHandler.ReturningText("", "content_filter"))
            .GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.FailureReason.Should().Contain("declined");
    }

    [Fact]
    public async Task GenerateAsync_LengthFinish_Fails()
    {
        QuestionGenerationResult result = await Create(FakeDeepSeekHandler.ReturningText("{\"questions\":[", "length"))
            .GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.FailureReason.Should().Contain("too long");
    }

    [Fact]
    public async Task GenerateAsync_EmptyContent_Fails()
    {
        QuestionGenerationResult result = await Create(FakeDeepSeekHandler.ReturningText("   "))
            .GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.FailureReason.Should().Contain("empty");
    }

    [Fact]
    public async Task GenerateAsync_NoChoices_Fails()
    {
        FakeDeepSeekHandler handler = new((_, _) => FakeDeepSeekHandler.Json(HttpStatusCode.OK, "{\"choices\":[]}"));

        QuestionGenerationResult result = await Create(handler).GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task GenerateAsync_NetworkError_Fails()
    {
        FakeDeepSeekHandler handler = new((_, _) => throw new HttpRequestException("connection refused"));

        QuestionGenerationResult result = await Create(handler).GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.FailureReason.Should().Be(DeepSeekQuestionGenerator.UnavailableMessage);
    }

    [Fact]
    public async Task GenerateAsync_NoApiKey_DoesNotCallApi()
    {
        FakeDeepSeekHandler handler = FakeDeepSeekHandler.ReturningText("{}");

        QuestionGenerationResult result = await Create(handler, apiKey: "").GenerateAsync(Request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        handler.Requests.Should().BeEmpty();
    }
}
