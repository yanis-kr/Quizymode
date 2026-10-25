using System.Net;
using System.Text;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>#273: a loaded manifest with a null list is invalid input (400 validation), not a leaked exception message.</summary>
public sealed class SeedSyncAdminHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private const string RequestJson =
        "{\"schemaVersion\":2,\"repositoryOwner\":\"quizymode\",\"repositoryName\":\"quizymode\",\"gitRef\":\"main\"}";

    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddScoped<IValidator<SeedSyncAdmin.Request>, SeedSyncAdmin.Validator>();
                services.AddSingleton<IGitHubSeedSource, NullItemIdsSeedSource>();
                services.AddScoped<LocalSeedLoader>();
                services.AddSingleton(new Mock<ITaxonomyRegistry>().Object);
                services.AddScoped<SeedSyncAdminService>();
            },
            app => new SeedSyncAdmin.Endpoint().MapEndpoint(app));
        await Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<(HttpStatusCode Status, string Body)> PostAsync(string path, bool admin)
    {
        string token = admin
            ? _host.CreateToken("admin", "admin@example.com", AdminGroups)
            : _host.CreateToken("member", "member@example.com");
        using StringContent content = new(RequestJson, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Post, path, token, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/admin/seed-sync/preview")]
    [InlineData("/admin/seed-sync/apply")]
    public async Task Post_CollectionWithoutItemIds_Returns400ValidationAndChangesNothing(string path)
    {
        (HttpStatusCode status, string body) = await PostAsync(path, admin: true);

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain("Admin.SeedSyncManifestInvalid");
        body.Should().Contain("Collection itemIds are required.");
        body.Should().NotContain("Object reference");
        body.Should().NotContain("SeedSyncPreviewFailed");
        body.Should().NotContain("SeedSyncApplyFailed");
        DbContext.Items.Count().Should().Be(0);
        DbContext.Collections.Count().Should().Be(0);
    }

    [Theory]
    [InlineData("/admin/seed-sync/preview")]
    [InlineData("/admin/seed-sync/apply")]
    public async Task Post_NonAdmin_Returns403(string path)
    {
        (HttpStatusCode status, _) = await PostAsync(path, admin: false);

        status.Should().Be(HttpStatusCode.Forbidden);
    }

    private sealed class NullItemIdsSeedSource : IGitHubSeedSource
    {
        public Task<Result<LoadedGitHubSeedManifest>> LoadManifestAsync(
            SeedSyncAdmin.Request request,
            CancellationToken cancellationToken)
        {
            SeedSyncAdmin.SeedItemRequest item = new(
                ItemId: Guid.NewGuid(),
                Category: "geography",
                NavigationKeyword1: "capitals",
                NavigationKeyword2: "europe",
                Question: "What is the capital of France?",
                CorrectAnswer: "Paris",
                IncorrectAnswers: ["Lyon"]);
            SeedSyncAdmin.SeedCollectionRequest collection = new(Guid.NewGuid(), "Broken", null, null!);

            return Task.FromResult(Result.Success(new LoadedGitHubSeedManifest(
                new SeedSyncAdmin.ManifestRequest("data/seed-source/items/geography", [item], [collection]),
                new SeedSyncAdmin.SourceContext(
                    "quizymode", "quizymode", "main", "abc123", "items", 1, "collections", 1),
                BranchTaxonomyYaml: null,
                BranchTaxonomySql: null)));
        }
    }
}
