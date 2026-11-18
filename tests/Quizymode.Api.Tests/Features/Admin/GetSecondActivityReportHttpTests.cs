using System.Net;
using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>
/// #715 AC 5.4.19 over real HTTP: the production JWT bearer configuration and "Admin" policy decide who can read
/// the second-activity report.
/// </summary>
public sealed class GetSecondActivityReportHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services => { },
            app => new GetSecondActivityReport.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<HttpResponseMessage> GetAsync(string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/admin/analytics/second-activity?days=7", token, null);
        return await _host.Client.SendAsync(request);
    }

    [Fact]
    public async Task SecondActivity_RejectsAnonymousExpiredAndNonAdminCallers()
    {
        string expiredAdmin = _host.CreateToken("admin-subject", "admin@example.com", AdminGroups, expiresUtc: DateTime.UtcNow.AddMinutes(-10));

        using HttpResponseMessage anonymous = await GetAsync(null);
        using HttpResponseMessage expired = await GetAsync(expiredAdmin);
        using HttpResponseMessage member = await GetAsync(_host.CreateToken("member", "member@example.com"));
        using HttpResponseMessage admin = await GetAsync(_host.CreateToken("admin-subject", "admin@example.com", AdminGroups));

        anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        expired.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        member.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        admin.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
