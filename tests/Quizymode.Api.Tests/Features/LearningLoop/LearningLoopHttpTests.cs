using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features.Personalization;
using Quizymode.Api.Shared.Models;
using ApiStartup = Quizymode.Api.StartupExtensions.StartupExtensions;
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

    private async Task<(HttpStatusCode Status, string Body)> SendWithBodyAsync(HttpMethod method, string url, string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, url, token);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Enqueue_RequiresAuthentication_AndHidesUnavailableItemsBehindOneIdentical404()
    {
        string member = _host.CreateToken("member", "member@example.com");
        Category category = await LearningLoopTestData.AddCategoryAsync(DbContext, "trivia");
        Item publicItem = await LearningLoopTestData.AddItemAsync(DbContext, category);
        Item foreignPrivate = await LearningLoopTestData.AddItemAsync(DbContext, category, isPrivate: true, createdBy: "someone-else");
        Item unplayable = await LearningLoopTestData.AddItemAsync(DbContext, category, incorrect: new List<string>());

        (await SendAsync(HttpMethod.Post, $"/review-queue/{publicItem.Id}", null)).Should().Be(HttpStatusCode.Unauthorized);

        (HttpStatusCode Status, string Body) missing = await SendWithBodyAsync(HttpMethod.Post, $"/review-queue/{Guid.NewGuid()}", member);
        (HttpStatusCode Status, string Body) foreign = await SendWithBodyAsync(HttpMethod.Post, $"/review-queue/{foreignPrivate.Id}", member);
        (HttpStatusCode Status, string Body) notPlayable = await SendWithBodyAsync(HttpMethod.Post, $"/review-queue/{unplayable.Id}", member);

        missing.Status.Should().Be(HttpStatusCode.NotFound);
        foreign.Status.Should().Be(HttpStatusCode.NotFound);
        notPlayable.Status.Should().Be(HttpStatusCode.NotFound);
        foreign.Body.Should().Be(missing.Body);
        notPlayable.Body.Should().Be(missing.Body);
        missing.Body.Should().Contain("This item can't be added to your review queue.");
        (await CreateDbContext().ReviewQueueEntries.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Enqueue_PublicItem_Returns200TwiceAndKeepsOneRow()
    {
        string member = _host.CreateToken("member", "member@example.com");
        Category category = await LearningLoopTestData.AddCategoryAsync(DbContext, "trivia");
        Item item = await LearningLoopTestData.AddItemAsync(DbContext, category);

        for (int call = 0; call < 2; call++)
        {
            using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Post, $"/review-queue/{item.Id}", member);
            using HttpResponseMessage response = await _host.Client.SendAsync(request);
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            Queue.EnqueueResponse? body = await response.Content.ReadFromJsonAsync<Queue.EnqueueResponse>();
            body!.ItemId.Should().Be(item.Id);
            body.IntervalDays.Should().Be(1);
            body.DueAt.Should().BeCloseTo(DateTime.UtcNow.AddDays(1), TimeSpan.FromMinutes(1));
        }

        (await CreateDbContext().ReviewQueueEntries.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Enqueue_BeyondRateLimit_Returns429WithReviewMessage_PerUser()
    {
        await using JwtHttpTestHost limited = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            _ => { },
            app => new Queue.Endpoint().MapEndpoint(app),
            useRateLimiting: true);
        string userA = limited.CreateToken("rate-a", "a@example.com");
        string userB = limited.CreateToken("rate-b", "b@example.com");
        Guid unknown = Guid.NewGuid();

        // Unknown item: 404 each time, but every call still counts against the policy.
        for (int call = 1; call <= 300; call++)
        {
            using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Post, $"/review-queue/{unknown}", userA);
            using HttpResponseMessage response = await limited.Client.SendAsync(request);
            response.StatusCode.Should().Be(HttpStatusCode.NotFound, $"call {call} is within the limit");
        }

        using (HttpRequestMessage over = JwtHttpTestHost.Request(HttpMethod.Post, $"/review-queue/{unknown}", userA))
        using (HttpResponseMessage rejected = await limited.Client.SendAsync(over))
        {
            rejected.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
            (await rejected.Content.ReadAsStringAsync()).Should().Contain("Too many Review queue updates. Please slow down.");
        }

        using HttpRequestMessage other = JwtHttpTestHost.Request(HttpMethod.Post, $"/review-queue/{unknown}", userB);
        using HttpResponseMessage otherResponse = await limited.Client.SendAsync(other);
        otherResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public void GetRejectionDetail_ReviewText_AppliesOnlyToTheEnqueuePath()
    {
        Guid id = Guid.NewGuid();

        ApiStartup.GetRejectionDetail(new PathString($"/api/review-queue/{id}"))
            .Should().Be("Too many Review queue updates. Please slow down.");
        ApiStartup.GetRejectionDetail(new PathString($"/api/review-queue/{id}/answers"))
            .Should().NotContain("Review queue");
    }
}
