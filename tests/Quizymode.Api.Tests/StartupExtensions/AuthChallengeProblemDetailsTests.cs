using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

public sealed class AuthChallengeProblemDetailsTests : DatabaseTestFixture, IAsyncLifetime
{
    private const string Bearer = "Bearer";
    private const string InvalidToken = "Bearer error=\"invalid_token\"";

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(CreateDbContext, _ => { }, MapProbes);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private static void MapProbes(IEndpointRouteBuilder app)
    {
        app.MapGet("/probe/auth", () => Results.Ok("ok")).RequireAuthorization();
        app.MapGet("/probe/admin", () => Results.Ok("ok")).RequireAuthorization("Admin");
        app.MapGet("/probe/forbid", () => Results.Forbid()).RequireAuthorization();
    }

    private async Task<(HttpResponseMessage Response, string Body)> GetAsync(string path, string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, path, token);
        HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response, await response.Content.ReadAsStringAsync());
    }

    private static void AssertProblem(HttpResponseMessage response, string body, HttpStatusCode status, string title)
    {
        response.StatusCode.Should().Be(status);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        using JsonDocument doc = JsonDocument.Parse(body);
        doc.RootElement.GetProperty("status").GetInt32().Should().Be((int)status);
        doc.RootElement.GetProperty("title").GetString().Should().Be(title);
        doc.RootElement.GetProperty("type").GetString().Should().NotBeNullOrWhiteSpace();
        doc.RootElement.GetProperty("detail").GetString().Should().NotBeNullOrWhiteSpace();
    }

    private static void AssertSingleChallenge(HttpResponseMessage response, string expected)
    {
        response.Headers.GetValues("WWW-Authenticate").Should().Equal(expected);
    }

    private static void AssertNoTokenInternals(HttpResponseMessage response, string body)
    {
        string headers = response.Headers.ToString();
        foreach (string text in new[] { body, headers })
        {
            text.Should().NotContain("IDX");
            text.Should().NotContain("expired at");
            text.Should().NotContain("error_description");
        }
    }

    [Fact]
    public async Task Anonymous_OnAuthenticatedEndpoint_Returns401ProblemDetails()
    {
        (HttpResponseMessage response, string body) = await GetAsync("/probe/auth", null);
        using (response)
        {
            AssertProblem(response, body, HttpStatusCode.Unauthorized, "Unauthorized");
            AssertSingleChallenge(response, Bearer);
        }
    }

    [Fact]
    public async Task Anonymous_OnAdminPolicyEndpoint_Returns401NotForbidden()
    {
        (HttpResponseMessage response, string body) = await GetAsync("/probe/admin", null);
        using (response)
        {
            AssertProblem(response, body, HttpStatusCode.Unauthorized, "Unauthorized");
            AssertSingleChallenge(response, Bearer);
        }
    }

    [Fact]
    public async Task ExpiredToken_Returns401WithInvalidTokenAndNoInternals()
    {
        // Past the 5-minute clock skew.
        string token = _host.CreateToken("sub-expired", "e@test.invalid", expiresUtc: DateTime.UtcNow.AddHours(-1));
        (HttpResponseMessage response, string body) = await GetAsync("/probe/auth", token);
        using (response)
        {
            AssertProblem(response, body, HttpStatusCode.Unauthorized, "Unauthorized");
            AssertSingleChallenge(response, InvalidToken);
            AssertNoTokenInternals(response, body);
        }
    }

    [Fact]
    public async Task MalformedToken_Returns401WithInvalidToken()
    {
        (HttpResponseMessage response, string body) = await GetAsync("/probe/auth", "not-a-jwt");
        using (response)
        {
            AssertProblem(response, body, HttpStatusCode.Unauthorized, "Unauthorized");
            AssertSingleChallenge(response, InvalidToken);
            AssertNoTokenInternals(response, body);
        }
    }

    [Fact]
    public async Task WrongIssuerToken_Returns401WithInvalidToken()
    {
        string token = _host.CreateToken("sub-issuer", "i@test.invalid", issuer: "https://evil.test.invalid/pool");
        (HttpResponseMessage response, string body) = await GetAsync("/probe/auth", token);
        using (response)
        {
            AssertProblem(response, body, HttpStatusCode.Unauthorized, "Unauthorized");
            AssertSingleChallenge(response, InvalidToken);
            AssertNoTokenInternals(response, body);
        }
    }

    [Fact]
    public async Task NonAdmin_OnAdminPolicyEndpoint_Returns403ProblemDetails()
    {
        string token = _host.CreateToken("sub-user", "u@test.invalid");
        (HttpResponseMessage response, string body) = await GetAsync("/probe/admin", token);
        using (response)
        {
            AssertProblem(response, body, HttpStatusCode.Forbidden, "Forbidden");
            response.Headers.Contains("WWW-Authenticate").Should().BeFalse();
            body.Should().NotContain("Admin");
        }
    }

    [Fact]
    public async Task HandlerForbid_Returns403ProblemDetails()
    {
        string token = _host.CreateToken("sub-forbid", "f@test.invalid");
        (HttpResponseMessage response, string body) = await GetAsync("/probe/forbid", token);
        using (response)
        {
            AssertProblem(response, body, HttpStatusCode.Forbidden, "Forbidden");
            response.Headers.Contains("WWW-Authenticate").Should().BeFalse();
        }
    }

    [Fact]
    public async Task ValidAdminToken_HappyPath_Returns200()
    {
        string token = _host.CreateToken("sub-admin", "a@test.invalid", ["Admins"]);
        (HttpResponseMessage response, _) = await GetAsync("/probe/admin", token);
        using (response)
        {
            response.StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }
}
