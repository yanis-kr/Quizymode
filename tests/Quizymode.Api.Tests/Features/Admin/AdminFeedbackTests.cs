using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Feedback;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>ANALYTICS-006 (#126) admin feedback inbox.</summary>
public sealed class AdminFeedbackTests : DatabaseTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services => services.AddScoped<IValidator<AdminFeedback.UpdateStatusRequest>, AdminFeedback.UpdateStatusValidator>(),
            app => new AdminFeedback.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private static FeedbackSubmission Submission(string type, string details, DateTime createdAt, string status = FeedbackStatus.New, Guid? userId = null, string? email = null, string? sessionId = null) => new()
    {
        Id = Guid.NewGuid(),
        Type = type,
        PageUrl = "https://www.quizymode.com/quiz",
        Details = details,
        Email = email,
        UserId = userId,
        SessionId = sessionId,
        Status = status,
        CreatedAt = createdAt
    };

    private async Task SeedAsync()
    {
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = userId, Subject = "u1", Email = "member@example.com" });
        DbContext.FeedbackSubmissions.AddRange(
            Submission("reportIssue", "Button broken", new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc), userId: userId, sessionId: "sess-1"),
            Submission("generalFeedback", "Love it", new DateTime(2026, 10, 5, 10, 0, 0, DateTimeKind.Utc), FeedbackStatus.Reviewed, email: "contact@example.com"),
            Submission("reportIssue", "Typo on home", new DateTime(2026, 10, 9, 10, 0, 0, DateTimeKind.Utc), FeedbackStatus.Archived));
        await DbContext.SaveChangesAsync();
    }

    private Task<Result<AdminFeedback.ListResponse>> List(AdminFeedback.ListQuery query) =>
        AdminFeedback.ListAsync(query, DbContext, CancellationToken.None);

    [Fact]
    public async Task List_ReturnsNewestFirst_WithEmailsAndNewCount()
    {
        await SeedAsync();

        AdminFeedback.ListResponse response = (await List(new AdminFeedback.ListQuery())).Value;

        response.TotalCount.Should().Be(3);
        response.NewCount.Should().Be(1);
        response.Items.Select(item => item.Details).Should().Equal("Typo on home", "Love it", "Button broken");
        response.Items[1].ContactEmail.Should().Be("contact@example.com");
        response.Items[2].UserEmail.Should().Be("member@example.com");
        response.Items[2].SessionId.Should().Be("sess-1");
    }

    [Fact]
    public async Task List_FiltersByTypeStatusDateRangeAndSearch_AndPages()
    {
        await SeedAsync();

        (await List(new AdminFeedback.ListQuery(Type: "reportIssue"))).Value.TotalCount.Should().Be(2);
        (await List(new AdminFeedback.ListQuery(Status: "reviewed"))).Value.Items.Should().ContainSingle()
            .Which.Details.Should().Be("Love it");
        (await List(new AdminFeedback.ListQuery(From: new DateTime(2026, 10, 2), To: new DateTime(2026, 10, 5)))).Value.Items
            .Should().ContainSingle().Which.Details.Should().Be("Love it");
        (await List(new AdminFeedback.ListQuery(Search: "MEMBER@example"))).Value.Items.Should().ContainSingle()
            .Which.Details.Should().Be("Button broken");
        AdminFeedback.ListResponse paged = (await List(new AdminFeedback.ListQuery(Page: 2, PageSize: 2))).Value;
        paged.Items.Should().ContainSingle().Which.Details.Should().Be("Button broken");
        paged.TotalCount.Should().Be(3);
        (await List(new AdminFeedback.ListQuery(Status: "bogus"))).IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateStatus_PersistsAndRejectsUnknownStatus()
    {
        await SeedAsync();
        Guid id = DbContext.FeedbackSubmissions.First(row => row.Details == "Button broken").Id;

        Result<AdminFeedback.FeedbackResponse> updated = await AdminFeedback.UpdateStatusAsync(
            id, new AdminFeedback.UpdateStatusRequest("reviewed"), DbContext, CancellationToken.None);

        updated.Value.Status.Should().Be(FeedbackStatus.Reviewed);
        using ApplicationDbContext fresh = CreateDbContext();
        fresh.FeedbackSubmissions.Single(row => row.Id == id).Status.Should().Be(FeedbackStatus.Reviewed);

        (await AdminFeedback.UpdateStatusAsync(id, new AdminFeedback.UpdateStatusRequest("nope"), DbContext, CancellationToken.None))
            .IsSuccess.Should().BeFalse();
        (await AdminFeedback.UpdateStatusAsync(Guid.NewGuid(), new AdminFeedback.UpdateStatusRequest("Archived"), DbContext, CancellationToken.None))
            .IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task Create_StoresSessionIdAndStartsAsNew()
    {
        Mock<IUserContext> userContext = new();
        userContext.Setup(x => x.UserId).Returns((string?)null);

        Result<CreateFeedbackSubmission.Response> result = await CreateFeedbackSubmission.HandleAsync(
            new CreateFeedbackSubmission.Request
            {
                Type = CreateFeedbackSubmission.ReportIssueType,
                CurrentUrl = "https://www.quizymode.com/x",
                Details = "broken",
                SessionId = " sess-9 "
            },
            DbContext,
            userContext.Object,
            new DefaultHttpContext(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        FeedbackSubmission stored = DbContext.FeedbackSubmissions.Single();
        stored.SessionId.Should().Be("sess-9");
        stored.Status.Should().Be(FeedbackStatus.New);
    }

    [Fact]
    public async Task Endpoints_RequireAdmin()
    {
        await SeedAsync();
        Guid id = DbContext.FeedbackSubmissions.First().Id;

        async Task<HttpStatusCode> Send(HttpMethod method, string url, string? token, object? body = null)
        {
            using HttpRequestMessage request = JwtHttpTestHost.Request(method, url, token);
            if (body is not null)
            {
                request.Content = JsonContent.Create(body);
            }

            using HttpResponseMessage response = await _host.Client.SendAsync(request);
            return response.StatusCode;
        }

        string member = _host.CreateToken("member", "member@example.com");
        string admin = _host.CreateToken("admin", "admin@example.com", AdminGroups);

        (await Send(HttpMethod.Get, "/admin/feedback", null)).Should().Be(HttpStatusCode.Unauthorized);
        (await Send(HttpMethod.Get, "/admin/feedback", member)).Should().Be(HttpStatusCode.Forbidden);
        (await Send(HttpMethod.Get, $"/admin/feedback/{id}", member)).Should().Be(HttpStatusCode.Forbidden);
        (await Send(HttpMethod.Put, $"/admin/feedback/{id}/status", member, new { status = "Reviewed" })).Should().Be(HttpStatusCode.Forbidden);

        (await Send(HttpMethod.Get, "/admin/feedback", admin)).Should().Be(HttpStatusCode.OK);
        (await Send(HttpMethod.Get, $"/admin/feedback/{id}", admin)).Should().Be(HttpStatusCode.OK);
        (await Send(HttpMethod.Put, $"/admin/feedback/{id}/status", admin, new { status = "Reviewed" })).Should().Be(HttpStatusCode.OK);
        (await Send(HttpMethod.Put, $"/admin/feedback/{id}/status", admin, new { status = "bad" })).Should().Be(HttpStatusCode.BadRequest);
        (await Send(HttpMethod.Get, $"/admin/feedback/{Guid.NewGuid()}", admin)).Should().Be(HttpStatusCode.NotFound);
    }
}
