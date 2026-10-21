using System.Net;
using System.Text;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>#281: unexpected seed-sync exceptions never reach the response body, and null manifest entries are rejected with 400.</summary>
public sealed class SeedSyncAdminLeakHttpTests : DatabaseTestFixture
{
    private const string Secret = "secret-internal-detail-281";
    private const string RequestJson =
        "{\"schemaVersion\":2,\"repositoryOwner\":\"quizymode\",\"repositoryName\":\"quizymode\",\"gitRef\":\"main\"}";

    private static readonly string[] AdminGroups = ["Admins"];

    private async Task<(JwtHttpTestHost Host, CapturingLoggerProvider Logs)> StartAsync(IGitHubSeedSource source)
    {
        CapturingLoggerProvider logs = new();
        JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddSingleton<ILoggerProvider>(logs);
                services.AddScoped<IValidator<SeedSyncAdmin.Request>, SeedSyncAdmin.Validator>();
                services.AddSingleton(source);
                services.AddScoped<LocalSeedLoader>();
                services.AddScoped<LanguagesTaxonomyNormalizationService>();
                services.AddSingleton(new Mock<ITaxonomyRegistry>().Object);
                services.AddScoped<SeedSyncAdminService>();
            },
            app => new SeedSyncAdmin.Endpoint().MapEndpoint(app));
        return (host, logs);
    }

    private static async Task<(HttpStatusCode Status, string Body)> PostAsync(JwtHttpTestHost host, string path)
    {
        string token = host.CreateToken("admin", "admin@example.com", AdminGroups);
        using StringContent content = new(RequestJson, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Post, path, token, content);
        using HttpResponseMessage response = await host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Preview_SourceThrows_Returns400WithGenericDetailAndLogsException()
    {
        (JwtHttpTestHost host, CapturingLoggerProvider logs) = await StartAsync(new ConfigurableSeedSource(() => throw new InvalidOperationException(Secret)));
        await using JwtHttpTestHost hostScope = host;

        (HttpStatusCode status, string body) = await PostAsync(host, "/admin/seed-sync/preview");

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain("Admin.SeedSyncPreviewFailed");
        body.Should().Contain("Failed to preview item sync.");
        body.Should().NotContain(Secret);
        body.Should().NotContain("InvalidOperationException");
        logs.Entries.Where(e => e.Level == LogLevel.Error && e.Exception?.Message == Secret).Should().ContainSingle();
    }

    [Theory]
    [InlineData("/admin/seed-sync/preview")]
    [InlineData("/admin/seed-sync/apply")]
    public async Task Post_NullItemEntry_Returns400ManifestInvalidAndChangesNothing(string path)
    {
        ConfigurableSeedSource source = new(() => new SeedSyncAdmin.ManifestRequest("seed", [null!], []));
        (JwtHttpTestHost host, _) = await StartAsync(source);
        await using JwtHttpTestHost hostScope = host;

        (HttpStatusCode status, string body) = await PostAsync(host, path);

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain("Admin.SeedSyncManifestInvalid");
        body.Should().Contain("Items must not contain null entries.");
        body.Should().NotContain("Object reference");
        DbContext.Items.Count().Should().Be(0);
        DbContext.Collections.Count().Should().Be(0);
    }

    private sealed class ConfigurableSeedSource : IGitHubSeedSource
    {
        private readonly Func<SeedSyncAdmin.ManifestRequest> _produce;

        public ConfigurableSeedSource(Func<SeedSyncAdmin.ManifestRequest> produce) => _produce = produce;

        public Task<Result<LoadedGitHubSeedManifest>> LoadManifestAsync(
            SeedSyncAdmin.Request request,
            CancellationToken cancellationToken)
        {
            SeedSyncAdmin.ManifestRequest manifest = _produce();
            return Task.FromResult(Result.Success(new LoadedGitHubSeedManifest(
                manifest,
                new SeedSyncAdmin.SourceContext("quizymode", "quizymode", "main", "abc123", "items", 1, "collections", 0),
                BranchTaxonomyYaml: null,
                BranchTaxonomySql: null)));
        }
    }
}
