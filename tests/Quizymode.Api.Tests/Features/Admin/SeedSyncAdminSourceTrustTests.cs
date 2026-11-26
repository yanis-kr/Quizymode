using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Shared.Taxonomy;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>
/// What admin seed sync may read from its source and what it may do with it: one configured repository, data only
/// (never SQL), and a preview that leaves the database as it was. Requires Docker.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class SeedSyncAdminSourceTrustTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private const string Sha = "0123456789abcdef0123456789abcdef01234567";
    private const string IndexPath = "data/seed-source/_registry/source-file-index.json";
    private const string ItemsPath = "data/seed-source/items/trust/items.json";

    [Theory]
    [InlineData("someone-else", "Quizymode")]
    [InlineData("yanis-kr", "other-repo")]
    [InlineData("yanis-kr/Quizymode/..", "..")]
    public async Task AC_5_2_26_OtherRepository_IsRefusedWithoutAnyOutboundRequest(string owner, string repo)
    {
        FakeGitHub gitHub = new();

        Result<LoadedGitHubSeedManifest> result = await Source(gitHub).LoadManifestAsync(
            Request(owner, repo), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Admin.SeedSyncRepositoryNotAllowed");
        gitHub.Requested.Should().BeEmpty();
    }

    [Fact]
    public async Task AC_5_2_26_AllowedRepository_IsMatchedIgnoringCaseAndUsesTheConfiguredSpelling()
    {
        FakeGitHub gitHub = ValidRepository(Taxonomy("zzone", "zzalpha"), Item("zzone", "zzalpha"));

        Result<LoadedGitHubSeedManifest> result = await Source(gitHub).LoadManifestAsync(
            Request("YANIS-KR", " quizymode "), CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.Error?.Description);
        result.Value!.SourceContext.RepositoryOwner.Should().Be("yanis-kr");
        result.Value.SourceContext.RepositoryName.Should().Be("Quizymode");
        gitHub.Requested.Should().OnlyContain(path => path.Contains("/yanis-kr/Quizymode/", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("data/seed-source/../../../../other/repo/main/items.json")]
    [InlineData("data/seed-source/%2e%2e/%2e%2e/%2e%2e/%2e%2e/other/repo/main/items.json")]
    [InlineData("data/seed-source/items\\..\\..\\x.json")]
    [InlineData("docs/items.json")]
    [InlineData("/data/seed-source/items/x.json")]
    public async Task AC_5_2_27_SourceFilePathOutsideTheSeedDirectory_IsRefusedAndNotFetched(string path)
    {
        FakeGitHub gitHub = ValidRepository(Taxonomy("zzone", "zzalpha"), Item("zzone", "zzalpha"));
        gitHub.Files[IndexPath] = Index(path);

        Result<LoadedGitHubSeedManifest> result = await Source(gitHub).LoadManifestAsync(
            Request(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.SeedSyncSourceFilePathNotAllowed");
        gitHub.Requested.Should().HaveCount(2, "only the commit lookup and the index are read");
    }

    [Theory]
    [InlineData("%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/other/repo/main/x.json")]
    [InlineData("%2E%2E/x.json")]
    [InlineData("a?b.json")]
    [InlineData("a#b.json")]
    [InlineData(".. /x.json")]
    public async Task AC_5_2_27_CollectionPathOutsideTheSeedDirectory_IsRefusedAndNotFetched(string name)
    {
        FakeGitHub gitHub = ValidRepository(Taxonomy("zzone", "zzalpha"), Item("zzone", "zzalpha"));
        string path = "data/seed-source/collections/public/" + name;
        gitHub.Tree.Add(path);

        Result<LoadedGitHubSeedManifest> result = await Source(gitHub).LoadManifestAsync(
            Request(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.SeedSyncSourceFilePathNotAllowed");
        gitHub.Requested.Should().OnlyContain(requested => requested.Contains("/yanis-kr/Quizymode/", StringComparison.Ordinal));
        gitHub.Requested.Should().HaveCount(4, "the commit, the index, one source file and the tree; no collection file");
    }

    [Theory]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData(" .. ")]
    public void AC_5_2_28_DotGitRef_IsRejected(string gitRef)
    {
        SeedSyncAdmin.Request request = Request() with { GitRef = gitRef };

        new SeedSyncAdmin.Validator().Validate(request).IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task AC_5_2_30_TaxonomyFetchFailure_FailsTheSync(HttpStatusCode status)
    {
        FakeGitHub gitHub = ValidRepository(Taxonomy("zzone", "zzalpha"), Item("zzone", "zzalpha"));
        gitHub.Failures["docs/quizymode_taxonomy.yaml"] = status;

        Result<LoadedGitHubSeedManifest> result = await Source(gitHub).LoadManifestAsync(
            Request(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.SeedSyncTaxonomyFetchFailed");
    }

    [Theory]
    [InlineData("abc1234", true)]
    [InlineData(Sha, true)]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("main", false)]
    [InlineData("abc123", false)]
    [InlineData("../../../../user", false)]
    [InlineData("abc1234?per_page=1", false)]
    public void AC_5_2_28_SinceCommitSha_MustBeACommitSha(string? since, bool valid)
    {
        SeedSyncAdmin.Request request = Request() with { SinceCommitSha = since };

        new SeedSyncAdmin.Validator().Validate(request).IsValid.Should().Be(valid);
    }

    [SkippableFact]
    public async Task AC_5_2_29_Preview_ReportsANewTaxonomyPathAndChangesNoTable()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string category = "zzpreview";
        FakeGitHub gitHub = ValidRepository(Taxonomy(category, "zzbeta"), Item(category, "zzbeta"));
        await using ApplicationDbContext db = fixture.CreateDbContext();
        string before = await SnapshotAsync();

        Result<SeedSyncAdmin.PreviewResponse> result = await Service(db, gitHub).PreviewAsync(Request(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.Error?.Description);
        result.Value!.CreatedCount.Should().Be(1);
        (await SnapshotAsync()).Should().Be(before);
        gitHub.Requested.Should().NotContain(path => path.EndsWith(".sql", StringComparison.OrdinalIgnoreCase));
    }

    [SkippableFact]
    public async Task AC_5_2_30_Apply_BuildsTheTaxonomyFromYamlAndNeverReadsOrRunsRepositorySql()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string category = "zzapply";
        FakeGitHub gitHub = ValidRepository(Taxonomy(category, "zzgamma"), Item(category, "zzgamma"));
        gitHub.Files["docs/quizymode_taxonomy_seed.sql"] = "CREATE TABLE zz_from_repository (id int);";
        await using ApplicationDbContext db = fixture.CreateDbContext();

        Result<SeedSyncAdmin.ApplyResponse> result = await Service(db, gitHub).ApplyAsync(Request(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue(result.Error?.Description);
        result.Value!.CreatedCount.Should().Be(1);
        gitHub.Requested.Should().NotContain(path => path.EndsWith(".sql", StringComparison.OrdinalIgnoreCase));
        await using ApplicationDbContext check = fixture.CreateDbContext();
        (await check.Database.SqlQueryRaw<bool>("SELECT to_regclass('zz_from_repository') IS NOT NULL AS \"Value\"")
            .SingleAsync()).Should().BeFalse();
        (await check.Categories.CountAsync(c => c.Name == category)).Should().Be(1);
        (await check.KeywordRelations.CountAsync(r => r.Category.Name == category)).Should().Be(3);

        await using ApplicationDbContext second = fixture.CreateDbContext();
        Result<SeedSyncAdmin.ApplyResponse> again = await Service(second, gitHub).ApplyAsync(Request(), CancellationToken.None);

        again.IsSuccess.Should().BeTrue(again.Error?.Description);
        again.Value!.UnchangedCount.Should().Be(1);
        (await check.KeywordRelations.CountAsync(r => r.Category.Name == category)).Should().Be(3);
    }

    [SkippableTheory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task AC_5_2_30_FailedSync_LeavesTheTaxonomyUnchanged(bool apply)
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string category = apply ? "zzfailapply" : "zzfailpreview";
        // The item names a path the taxonomy does not have, so planning fails after the taxonomy was written.
        FakeGitHub gitHub = ValidRepository(Taxonomy(category, "zzdelta"), Item(category, "zzmissing"));
        await using ApplicationDbContext db = fixture.CreateDbContext();
        string before = await SnapshotAsync();
        SeedSyncAdminService service = Service(db, gitHub);

        bool failed = apply
            ? (await service.ApplyAsync(Request(), CancellationToken.None)).IsFailure
            : (await service.PreviewAsync(Request(), CancellationToken.None)).IsFailure;

        failed.Should().BeTrue();
        (await SnapshotAsync()).Should().Be(before);
    }

    [SkippableFact]
    public async Task AC_5_2_31_TaxonomySync_WritesTheSameRowsAsTheGeneratedSeedSql()
    {
        // Also guards the two extra containers below: without Docker the class fixture has already failed to start.
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        // A database of its own for each side, so neither sees the other's rows.
        PostgresContainerFixture fromSql = new();
        PostgresContainerFixture fromYaml = new();
        await fromSql.InitializeAsync();
        await fromYaml.InitializeAsync();
        try
        {
            string sql = await File.ReadAllTextAsync(RepoFile("docs", "quizymode_taxonomy_seed.sql"));
            IReadOnlyDictionary<string, TaxonomyCategoryDefinition> definitions =
                TaxonomyYamlParser.LoadFromFile(RepoFile("docs", "quizymode_taxonomy.yaml"));

            await using (ApplicationDbContext db = fromSql.CreateDbContext())
            {
                await db.Database.ExecuteSqlRawAsync(sql.TrimStart('﻿').Replace("{", "{{").Replace("}", "}}"));
            }

            await using (ApplicationDbContext db = fromYaml.CreateDbContext())
            {
                await TaxonomyDatabaseSync.ApplyAsync(db, definitions, CancellationToken.None);
            }

            string expected = await SnapshotAsync(fromSql);
            (await SnapshotAsync(fromYaml)).Should().Be(expected);

            // Applying over rows the SQL created changes nothing.
            await using (ApplicationDbContext db = fromSql.CreateDbContext())
            {
                await TaxonomyDatabaseSync.ApplyAsync(db, definitions, CancellationToken.None);
            }

            (await SnapshotAsync(fromSql)).Should().Be(expected);
        }
        finally
        {
            await fromSql.DisposeAsync();
            await fromYaml.DisposeAsync();
        }
    }

    private Task<string> SnapshotAsync() => SnapshotAsync(fixture);

    /// <summary>Every row the sync can write. Relation ids are random, so they are left out.</summary>
    private static async Task<string> SnapshotAsync(PostgresContainerFixture database)
    {
        await using ApplicationDbContext db = database.CreateDbContext();
        var snapshot = new
        {
            Categories = await db.Categories.AsNoTracking().OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name, c.Description, c.ShortDescription, c.IsPrivate, c.CreatedBy })
                .ToListAsync(),
            Keywords = await db.Keywords.AsNoTracking().OrderBy(k => k.Name).ThenBy(k => k.CreatedBy)
                .Select(k => new { k.Id, k.Name, k.Slug, k.IsPrivate, k.CreatedBy, k.IsReviewPending })
                .ToListAsync(),
            Relations = (await db.KeywordRelations.AsNoTracking()
                    .Select(r => new { r.CategoryId, r.ParentKeywordId, r.ChildKeywordId, r.SortOrder, r.Description, r.IsPrivate, r.CreatedBy })
                    .ToListAsync())
                .OrderBy(r => r.CategoryId).ThenBy(r => r.ParentKeywordId).ThenBy(r => r.ChildKeywordId).ThenBy(r => r.SortOrder),
            Items = await db.Items.AsNoTracking().OrderBy(i => i.Id).Select(i => new { i.Id, i.Question }).ToListAsync(),
            Collections = await db.Collections.AsNoTracking().OrderBy(c => c.Id).Select(c => new { c.Id, c.Name }).ToListAsync(),
            Runs = await db.SeedSyncRuns.AsNoTracking().CountAsync()
        };
        return JsonSerializer.Serialize(snapshot);
    }

    private static string RepoFile(params string[] parts)
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Quizymode.sln")))
        {
            directory = directory.Parent;
        }

        directory.Should().NotBeNull("the tests run inside the repository");
        return Path.Combine([directory!.FullName, .. parts]);
    }

    private static SeedSyncAdmin.Request Request(string owner = "yanis-kr", string repo = "Quizymode") =>
        new(SchemaVersion: 2, RepositoryOwner: owner, RepositoryName: repo, GitRef: "main");

    private static GitHubSeedSource Source(FakeGitHub gitHub) =>
        new(new HttpClient(gitHub), Options.Create(new GitHubSeedSyncOptions()));

    private static SeedSyncAdminService Service(ApplicationDbContext db, FakeGitHub gitHub)
    {
        Mock<IWebHostEnvironment> environment = new();
        environment.Setup(e => e.ContentRootPath).Returns("/nonexistent");
        return new SeedSyncAdminService(
            db,
            new Mock<ITaxonomyRegistry>().Object,
            Source(gitHub),
            new LocalSeedLoader(environment.Object, NullLogger<LocalSeedLoader>.Instance),
            new Mock<IUserContext>().Object);
    }

    private static string Taxonomy(string category, string leaf) =>
        $"""
        {category}:
          description: A category used only by this test.
          keywords:
            {category}-topic:
              description: A topic.
              keywords:
                {leaf}: A subtopic.
        """;

    private static string Item(string category, string leaf) =>
        JsonSerializer.Serialize(new[]
        {
            new
            {
                itemId = Guid.NewGuid(),
                category,
                navigationKeyword1 = $"{category}-topic",
                navigationKeyword2 = leaf,
                question = $"Which is the {category} answer?",
                correctAnswer = "This one",
                incorrectAnswers = new[] { "That one" }
            }
        });

    private static string Index(string path) =>
        JsonSerializer.Serialize(new
        {
            totalItems = 1,
            files = new[] { new { path, category = "c", nav1 = "n", nav2 = "m", itemCount = 1 } }
        });

    private static FakeGitHub ValidRepository(string taxonomyYaml, string itemsJson)
    {
        FakeGitHub gitHub = new();
        gitHub.Files[IndexPath] = Index(ItemsPath);
        gitHub.Files[ItemsPath] = itemsJson;
        gitHub.Files["docs/quizymode_taxonomy.yaml"] = taxonomyYaml;
        return gitHub;
    }

    private sealed class FakeGitHub : HttpMessageHandler
    {
        public Dictionary<string, string> Files { get; } = [];

        public List<string> Requested { get; } = [];

        public List<string> Tree { get; } = [];

        public Dictionary<string, HttpStatusCode> Failures { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string path = request.RequestUri!.AbsolutePath;
            Requested.Add(path);

            string? body = null;
            if (path.Contains("/commits/", StringComparison.Ordinal))
            {
                body = $$"""{"sha":"{{Sha}}"}""";
            }
            else if (path.Contains("/git/trees/", StringComparison.Ordinal))
            {
                body = JsonSerializer.Serialize(new { tree = Tree.Select(p => new { path = p, type = "blob" }) });
            }
            else
            {
                int start = path.IndexOf(Sha + "/", StringComparison.Ordinal);
                if (start >= 0 && Failures.TryGetValue(path[(start + Sha.Length + 1)..], out HttpStatusCode failure))
                {
                    return Task.FromResult(new HttpResponseMessage(failure));
                }

                if (start >= 0 && Files.TryGetValue(path[(start + Sha.Length + 1)..], out string? file))
                {
                    body = file;
                }
            }

            return Task.FromResult(body is null
                ? new HttpResponseMessage(HttpStatusCode.NotFound)
                : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }
}
