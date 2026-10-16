using System.Net;
using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>ANALYTICS-007 (#127): only admins can read the learning report, checked over real HTTP.</summary>
public sealed class LearningReportHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(CreateDbContext, _ => { }, app => new GetLearningReport.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<HttpStatusCode> GetAsync(string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/admin/analytics/learning?days=7", token);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return response.StatusCode;
    }

    [Fact]
    public async Task LearningReport_RejectsAnonymousExpiredAndNonAdminCallers()
    {
        (await GetAsync(null)).Should().Be(HttpStatusCode.Unauthorized);
        (await GetAsync(_host.CreateToken("admin", "admin@example.com", AdminGroups, expiresUtc: DateTime.UtcNow.AddMinutes(-10))))
            .Should().Be(HttpStatusCode.Unauthorized);
        (await GetAsync(_host.CreateToken("member", "member@example.com"))).Should().Be(HttpStatusCode.Forbidden);
        (await GetAsync(_host.CreateToken("admin", "admin@example.com", AdminGroups))).Should().Be(HttpStatusCode.OK);
    }
}
