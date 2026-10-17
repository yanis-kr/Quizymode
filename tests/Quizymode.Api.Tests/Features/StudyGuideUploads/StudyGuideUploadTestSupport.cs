using System.Net;
using System.Text;
using System.Text.Json;
using Moq;
using Quizymode.Api.Services;

namespace Quizymode.Api.Tests.Features.StudyGuideUploads;

/// <summary>Fake HTTP handler for the Anthropic Messages API; never touches the network.</summary>
internal sealed class FakeAnthropicHandler(Func<HttpRequestMessage, string, HttpResponseMessage> respond) : HttpMessageHandler
{
    public List<(HttpRequestMessage Request, string Body)> Requests { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        string body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Add((request, body));
        return respond(request, body);
    }

    public static FakeAnthropicHandler ReturningText(string text, string stopReason = "end_turn") =>
        new((_, _) => Json(HttpStatusCode.OK, MessageBody(text, stopReason)));

    public static FakeAnthropicHandler ReturningStatus(HttpStatusCode statusCode) =>
        new((_, _) => Json(statusCode, "{\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"boom\"}}"));

    public static string MessageBody(string text, string stopReason = "end_turn") =>
        JsonSerializer.Serialize(new
        {
            id = "msg_test",
            type = "message",
            role = "assistant",
            content = new object[]
            {
                new { type = "thinking", thinking = "", signature = "sig" },
                new { type = "text", text }
            },
            stop_reason = stopReason
        });

    private static HttpResponseMessage Json(HttpStatusCode statusCode, string body) =>
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
