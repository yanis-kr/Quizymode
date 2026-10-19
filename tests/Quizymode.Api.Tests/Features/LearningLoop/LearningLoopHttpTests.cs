using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features.Personalization;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using Daily = Quizymode.Api.Features.DailyQuiz.DailyQuiz;
using Queue = Quizymode.Api.Features.ReviewQueue.ReviewQueue;

namespace Quizymode.Api.Tests.Features.LearningLoop;

/// <summary>Epic #197: authorization of the review queue, daily quiz, and interests endpoints with real JWT validation.</summary>
public sealed class LearningLoopHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddMemoryCache();
                services.AddScoped<IValidator<Daily.CompleteRequest>, Daily.CompleteValidator>();
                services.AddScoped<IValidator<Personalization.UpdateInterestsRequest>, Personalization.UpdateValidator>();
            },
            app =>
            {
                new Queue.Endpoint().MapEndpoint(app);
                new Daily.Endpoint().MapEndpoint(app);
                new Personalization.Endpoint().MapEndpoint(app);
            });
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<HttpStatusCode> SendAsync(HttpMethod method, string url, string? token, object? body = null)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, url, token);
        if (body is not null) request.Content = JsonContent.Create(body);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return response.StatusCode;
    }

    [Fact]
    public async Task Endpoints_EnforceAnonymousMemberAndAdminAccess()
    {
        string member = _host.CreateToken("member", "member@example.com");
        string admin = _host.CreateToken("admin", "admin@example.com", AdminGroups);
        string today = DateTime.UtcNow.ToString("yyyy-MM-dd");

        (await SendAsync(HttpMethod.Get, "/review-queue", null)).Should().Be(HttpStatusCode.Unauthorized);
        (await SendAsync(HttpMethod.Get, "/review-queue/summary", null)).Should().Be(HttpStatusCode.Unauthorized);
        (await SendAsync(HttpMethod.Post, $"/review-queue/{Guid.NewGuid()}/answers", null, new { isCorrect = true })).Should().Be(HttpStatusCode.Unauthorized);
        (await SendAsync(HttpMethod.Post, "/daily-quiz/completions", null, new { date = today, correct = 1, total = 5 })).Should().Be(HttpStatusCode.Unauthorized);
        (await SendAsync(HttpMethod.Get, "/users/me/interests", null)).Should().Be(HttpStatusCode.Unauthorized);
        (await SendAsync(HttpMethod.Get, "/admin/daily-quiz", null)).Should().Be(HttpStatusCode.Unauthorized);

        (await SendAsync(HttpMethod.Get, "/daily-quiz", null)).Should().Be(HttpStatusCode.OK);
        (await SendAsync(HttpMethod.Get, "/home/popular-categories", null)).Should().Be(HttpStatusCode.OK);

        (await SendAsync(HttpMethod.Get, "/review-queue", member)).Should().Be(HttpStatusCode.OK);
        (await SendAsync(HttpMethod.Get, "/review-queue/summary", member)).Should().Be(HttpStatusCode.OK);
        (await SendAsync(HttpMethod.Post, $"/review-queue/{Guid.NewGuid()}/answers", member, new { isCorrect = true })).Should().Be(HttpStatusCode.NotFound);
        (await SendAsync(HttpMethod.Get, "/users/me/interests", member)).Should().Be(HttpStatusCode.OK);
        (await SendAsync(HttpMethod.Put, "/users/me/interests", member, new { categories = new[] { "Bad Slug" } })).Should().Be(HttpStatusCode.BadRequest);
        (await SendAsync(HttpMethod.Post, "/daily-quiz/completions", member, new { date = today, correct = 1, total = 5 })).Should().Be(HttpStatusCode.BadRequest, "no daily set has any items");
        (await SendAsync(HttpMethod.Get, "/admin/daily-quiz", member)).Should().Be(HttpStatusCode.Forbidden);
        (await SendAsync(HttpMethod.Post, $"/admin/daily-quiz/{today}/items/{Guid.NewGuid()}/exclude", member)).Should().Be(HttpStatusCode.Forbidden);

        (await SendAsync(HttpMethod.Get, "/admin/daily-quiz", admin)).Should().Be(HttpStatusCode.OK);
        (await SendAsync(HttpMethod.Get, "/admin/daily-quiz?date=1999-01-01", admin)).Should().Be(HttpStatusCode.BadRequest);
        (await SendAsync(HttpMethod.Post, $"/admin/daily-quiz/{today}/items/{Guid.NewGuid()}/exclude", admin)).Should().Be(HttpStatusCode.NotFound);
    }
}
