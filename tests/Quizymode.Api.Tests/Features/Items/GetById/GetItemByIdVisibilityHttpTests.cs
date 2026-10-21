using System.Net;
using FluentAssertions;
using Quizymode.Api.Features.Items.GetById;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.GetById;

/// <summary>#285: GET /items/{id} must not disclose other users' private items; the response equals the missing-id one.</summary>
public sealed class GetItemByIdVisibilityHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;
    private Guid _privateItemId;
    private Guid _publicItemId;

    public async Task InitializeAsync()
    {
        Guid ownerId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = ownerId, Subject = "owner", Email = "owner@example.com", Name = "owner" });
        Category category = VisibilitySeed.AddCategory(DbContext);
        _privateItemId = VisibilitySeed.AddItem(DbContext, category, ownerId.ToString(), true).Id;
        _publicItemId = VisibilitySeed.AddItem(DbContext, category, ownerId.ToString(), false).Id;
        await DbContext.SaveChangesAsync();

        _host = await JwtHttpTestHost.StartAsync(CreateDbContext, _ => { }, app => new GetItemById.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<(HttpStatusCode Status, string Body, string? ContentType)> GetAsync(string id, string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, $"/items/{id}", token);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync(), response.Content.Headers.ContentType?.ToString());
    }

    private string Token(string subject, params string[] groups) => _host.CreateToken(subject, $"{subject}@example.com", groups);

    [Fact]
    public async Task Owner_CanReadOwnPrivateItem()
    {
        (await GetAsync(_privateItemId.ToString(), Token("owner"))).Status.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task OtherUser_AndAnonymous_GetResponseIdenticalToMissingId()
    {
        var missing = await GetAsync(Guid.NewGuid().ToString(), Token("other"));
        missing.Status.Should().Be(HttpStatusCode.NotFound);
        missing.Body.Should().BeEmpty();

        foreach (string? token in new[] { Token("other"), null })
        {
            var result = await GetAsync(_privateItemId.ToString(), token);

            result.Status.Should().Be(missing.Status);
            result.Body.Should().Be(missing.Body);
            result.ContentType.Should().Be(missing.ContentType);
        }
    }

    [Fact]
    public async Task Admin_CanReadAnotherUsersPrivateItem()
    {
        (await GetAsync(_privateItemId.ToString(), Token("admin", AdminGroups))).Status.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task PublicItem_IsReadableAnonymously()
    {
        (await GetAsync(_publicItemId.ToString(), null)).Status.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task MalformedId_Returns400()
    {
        (await GetAsync("not-a-guid", null)).Status.Should().Be(HttpStatusCode.BadRequest);
    }
}
