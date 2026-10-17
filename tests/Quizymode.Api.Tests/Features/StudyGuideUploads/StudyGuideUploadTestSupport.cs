using System.Net;
using System.Text;
using System.Text.Json;
using Moq;
using Quizymode.Api.Services;

namespace Quizymode.Api.Tests.Features.StudyGuideUploads;

/// <summary>Fake HTTP handler for the DeepSeek chat completions API; never touches the network.</summary>
internal sealed class FakeDeepSeekHandler(Func<HttpRequestMessage, string, HttpResponseMessage> respond) : HttpMessageHandler
{
    public List<(HttpRequestMessage Request, string Body)> Requests { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        string body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Add((request, body));
        return respond(request, body);
    }

    public static FakeDeepSeekHandler ReturningText(string text, string finishReason = "stop") =>
        new((_, _) => Json(HttpStatusCode.OK, CompletionBody(text, finishReason)));

    public static FakeDeepSeekHandler ReturningStatus(HttpStatusCode statusCode) =>
        new((_, _) => Json(statusCode, "{\"error\":{\"message\":\"boom\",\"type\":\"api_error\",\"code\":\"x\"}}"));

    public static string CompletionBody(string text, string finishReason = "stop") =>
        JsonSerializer.Serialize(new
        {
            id = "chatcmpl-test",
            @object = "chat.completion",
            model = "deepseek-chat",
            choices = new object[]
            {
                new
                {
                    index = 0,
                    message = new { role = "assistant", content = text },
                    finish_reason = finishReason
                }
            }
        });

    public static HttpResponseMessage Json(HttpStatusCode statusCode, string body) =>
        new(statusCode) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
}

internal static class StudyGuideUploadTestData
{
    public static string QuestionsJson(int count, string? questionPrefix = null) =>
        JsonSerializer.Serialize(new
        {
            questions = Enumerable.Range(1, count).Select(i => new
            {
                question = $"{questionPrefix ?? "What is fact"} {i}?",
                correctAnswer = $"Answer {i}",
                incorrectAnswers = new[] { $"Wrong {i}a", $"Wrong {i}b", $"Wrong {i}c" },
                explanation = $"The material states answer {i}."
            })
        });

    /// <summary>Moderation mock that blocks any value containing "badword".</summary>
    public static ITextModerationService Moderation()
    {
        Mock<ITextModerationService> moderation = new();
        moderation
            .Setup(x => x.Evaluate(It.IsAny<string?[]>()))
            .Returns((string?[] values) => values.Any(v => v is not null && v.Contains("badword", StringComparison.OrdinalIgnoreCase))
                ? new TextModerationResult(TextModerationOutcome.Blocked, "badword")
                : new TextModerationResult(TextModerationOutcome.Clean));
        return moderation.Object;
    }
}
