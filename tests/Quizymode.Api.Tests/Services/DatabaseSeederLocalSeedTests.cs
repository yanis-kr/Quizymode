using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using CapturedLog = Quizymode.Api.Tests.TestFixtures.CapturingLoggerProvider.CapturedLog;

namespace Quizymode.Api.Tests.Services;

/// <summary>#329: local dev seed resolution and item loading must fail safe instead of reading non-item JSON.</summary>
public sealed class DatabaseSeederLocalSeedTests : IDisposable
{
    private const string ItemsSource = "data/seed-source/items-does-not-exist";

    private readonly string _root = Path.Combine(Path.GetTempPath(), "qm-seed-" + Guid.NewGuid().ToString("N"));
    private readonly CapturingLoggerProvider _logs = new();
    private readonly ILogger _logger;

    public DatabaseSeederLocalSeedTests()
    {
        Directory.CreateDirectory(_root);
        _logger = LoggerFactory.Create(b => b.AddProvider(_logs)).CreateLogger("test");
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private List<CapturedLog> Warnings => _logs.Entries.Where(e => e.Level == LogLevel.Warning).ToList();

    private string SeedRoot()
    {
        // Production image layout: selection.json + collections/home-sample.json, no items folder.
        string seedRoot = Path.Combine(_root, "seed");
        Directory.CreateDirectory(Path.Combine(seedRoot, "collections"));
        File.WriteAllText(Path.Combine(seedRoot, "selection.json"), "{\"itemsSource\":\"" + ItemsSource + "\",\"itemIds\":[]}");
        File.WriteAllText(Path.Combine(seedRoot, "collections", "home-sample.json"), "{\"collectionId\":\"" + Guid.NewGuid() + "\"}");
        return seedRoot;
    }

    [Fact]
    public void ResolveItemsPath_ItemsSourceMissingAndNoLocalItems_ReturnsNullWithOneWarning()
    {
        string? result = DatabaseSeederHostedService.ResolveItemsPath(SeedRoot(), ItemsSource, _root, _logger);

        result.Should().BeNull();
        Warnings.Should().ContainSingle().Which.Message.Should().Contain("Seed items folder not found");
    }

    [Fact]
    public void ResolveItemsPath_ItemsSourceMissing_LocalItemsExists_UsesLocalWithOneWarning()
    {
        string seedRoot = SeedRoot();
        string localItems = Directory.CreateDirectory(Path.Combine(seedRoot, "items")).FullName;

        string? result = DatabaseSeederHostedService.ResolveItemsPath(seedRoot, ItemsSource, _root, _logger);

        result.Should().Be(localItems);
        Warnings.Should().ContainSingle().Which.Message.Should().Contain("not found; using local items folder");
    }

    [Fact]
    public void ResolveItemsPath_ItemsSourceResolves_NoWarning()
    {
        string seedRoot = SeedRoot();
        string source = Directory.CreateDirectory(Path.Combine(_root, "source-items")).FullName;

        string? result = DatabaseSeederHostedService.ResolveItemsPath(seedRoot, "source-items", _root, _logger);

        result.Should().Be(source);
        Warnings.Should().BeEmpty();
    }

    [Fact]
    public void ResolveItemsPath_NeverReturnsSeedRoot()
    {
        string seedRoot = SeedRoot();

        DatabaseSeederHostedService.ResolveItemsPath(seedRoot, null, _root, _logger).Should().BeNull();
    }

    [Fact]
    public async Task LoadSeedItemRequests_SkipsObjectAndMalformedJson_LogsOneWarning()
    {
        string items = Directory.CreateDirectory(Path.Combine(_root, "items")).FullName;
        Guid itemId = Guid.NewGuid();
        File.WriteAllText(Path.Combine(items, "a-valid.json"), ValidItemJson(itemId));
        File.WriteAllText(Path.Combine(items, "b-selection.json"), "{\"itemsSource\":\"x\",\"itemIds\":[]}");
        File.WriteAllText(Path.Combine(items, "c-malformed.json"), "[{ not json");

        List<SeedSyncAdmin.SeedItemRequest> requests =
            await DatabaseSeederHostedService.LoadSeedItemRequestsAsync(items, null, _logger, CancellationToken.None);

        requests.Should().ContainSingle().Which.ItemId.Should().Be(itemId);
        CapturedLog warning = Warnings.Should().ContainSingle().Subject;
        warning.Message.Should().Contain("Skipped 2 non-item JSON file(s)")
            .And.Contain("b-selection.json").And.Contain("c-malformed.json");
    }

    [Fact]
    public async Task LoadSeedItemRequests_AppliesAllowedIdsFilter()
    {
        string items = Directory.CreateDirectory(Path.Combine(_root, "items")).FullName;
        Guid keep = Guid.NewGuid();
        File.WriteAllText(Path.Combine(items, "one.json"), ValidItemJson(keep));
        File.WriteAllText(Path.Combine(items, "two.json"), ValidItemJson(Guid.NewGuid()));

        List<SeedSyncAdmin.SeedItemRequest> requests = await DatabaseSeederHostedService.LoadSeedItemRequestsAsync(
            items, [keep], _logger, CancellationToken.None);

        requests.Should().ContainSingle().Which.ItemId.Should().Be(keep);
        Warnings.Should().BeEmpty();
    }

    private static string ValidItemJson(Guid itemId) =>
        "[{\"itemId\":\"" + itemId + "\",\"category\":\"science\",\"navigationKeyword1\":\"astronomy\"," +
        "\"navigationKeyword2\":\"solar-system\",\"question\":\"Q?\",\"correctAnswer\":\"A\"," +
        "\"incorrectAnswers\":[\"B\",\"C\",\"D\"],\"explanation\":\"E\",\"keywords\":[]}]";
}

internal sealed class TestWebHostEnvironment : IWebHostEnvironment
{
    public string EnvironmentName { get; set; } = Environments.Development;
    public string ApplicationName { get; set; } = "Quizymode.Api.Tests";
    public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    public string WebRootPath { get; set; } = AppContext.BaseDirectory;
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
}

internal static class DatabaseSeederStartHarness
{
    /// <summary>Runs StartAsync against the container with a prod-image-shaped seed folder (no items folder).</summary>
    public static async Task<(CapturingLoggerProvider Logs, SqlCaptureInterceptor Sql)> RunAsync(
        PostgresContainerFixture fixture, string environmentName)
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "qm-seed-" + Guid.NewGuid().ToString("N"));
        string seedRoot = Path.Combine(tempRoot, "seed");
        Directory.CreateDirectory(Path.Combine(seedRoot, "collections"));
        File.WriteAllText(
            Path.Combine(seedRoot, "selection.json"),
            "{\"itemsSource\":\"data/seed-source/items-does-not-exist\",\"itemIds\":[]}");
        File.WriteAllText(Path.Combine(seedRoot, "collections", "home-sample.json"), "{\"collectionId\":\"" + Guid.NewGuid() + "\"}");

        try
        {
            CapturingLoggerProvider logs = new();
            SqlCaptureInterceptor sql = new();
            ILoggerFactory loggerFactory = LoggerFactory.Create(b => b.AddProvider(logs));

            ServiceCollection services = new();
            services.AddScoped(_ => fixture.CreateDbContext(sql));
            ServiceProvider provider = services.BuildServiceProvider();

            DatabaseSeederHostedService seeder = new(
                loggerFactory.CreateLogger<DatabaseSeederHostedService>(),
                provider,
                new TestWebHostEnvironment { EnvironmentName = environmentName },
                Options.Create(new SeedOptions { Path = seedRoot }),
                Options.Create(new TaxonomyOptions()));

            await seeder.StartAsync(CancellationToken.None);
            return (logs, sql);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }
}

[Trait("Category", "Postgres")]
public sealed class DatabaseSeederProductionPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    [SkippableFact]
    public async Task StartAsync_Production_RunsOnlyTaxonomy()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        (CapturingLoggerProvider logs, SqlCaptureInterceptor sql) = await DatabaseSeederStartHarness.RunAsync(fixture, "Production");

        logs.Entries.Where(e => e.Level == LogLevel.Error).Should().BeEmpty();
        logs.Entries.Should().Contain(e => e.Level == LogLevel.Information && e.Message.Contains("Taxonomy seed SQL applied."));
        logs.Entries.Should().ContainSingle(e => e.Message.Contains("Skipping local dev seed") && e.Message.Contains("Production"));
        logs.Entries.Should().NotContain(e => e.Message.Contains("itemsSource") || e.Message.Contains("Seed items folder not found"));

        logs.Entries.Should().NotContain(e => e.Message.Contains("Ideas seed SQL applied."));
        foreach (string table in new[] { "\"Items\"", "\"Ratings\"", "\"Collections\"", "\"CollectionItems\"", "\"FeaturedItems\"" })
        {
            sql.Count(table).Should().Be(0, $"production startup must not query {table}");
        }

        await using ApplicationDbContext db = fixture.CreateDbContext();
        (await db.Categories.CountAsync()).Should().BeGreaterThan(0);
        (await db.Collections.CountAsync()).Should().Be(0);
        (await db.Ratings.CountAsync()).Should().Be(0);
        (await db.FeaturedItems.CountAsync()).Should().Be(0, "default featured sets are dev-only (#336)");
        (await db.Ideas.CountAsync()).Should().Be(0, "the curated ideas seed is dev-only (#336)");
    }
}

[Trait("Category", "Postgres")]
public sealed class DatabaseSeederDevelopmentPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    [SkippableFact]
    public async Task StartAsync_Development_MissingItemsFolder_FailsSafe()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        (CapturingLoggerProvider logs, SqlCaptureInterceptor sql) = await DatabaseSeederStartHarness.RunAsync(fixture, "Development");

        logs.Entries.Where(e => e.Level == LogLevel.Error).Should().BeEmpty();
        logs.Entries.Where(e => e.Level == LogLevel.Warning && e.Message.Contains("Seed items folder not found"))
            .Should().ContainSingle();
        sql.Count("\"Collections\"").Should().Be(0);

        await using ApplicationDbContext db = fixture.CreateDbContext();
        (await db.FeaturedItems.CountAsync()).Should().Be(4);
        (await db.Collections.CountAsync()).Should().Be(0);
    }
}
