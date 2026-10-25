using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>#337: the ideas seed SQL and moderation terms must ship at lowercase data/... (Linux is case-sensitive).</summary>
public sealed class DatabaseSeederIdeasSeedTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "qm-ideas-" + Guid.NewGuid().ToString("N"));

    public DatabaseSeederIdeasSeedTests()
    {
        Directory.CreateDirectory(_root);
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    [Fact]
    public void IdeasSeedSql_IsCopiedToOutput_WithLowercaseDataPath()
    {
        string path = Path.Combine(AppContext.BaseDirectory, "data", "ideas", "ideas_seed.sql");

        File.Exists(path).Should().BeTrue();
        if (OperatingSystem.IsLinux())
        {
            Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "data", "ideas"))
                .Select(Path.GetFileName).Should().Contain("ideas_seed.sql");
        }
    }

    [Fact]
    public void ModerationTerms_IsCopiedToOutput_WithLowercaseDataPath()
    {
        File.Exists(Path.Combine(AppContext.BaseDirectory, "data", "moderation", "idea-moderation-terms.json"))
            .Should().BeTrue();
    }

    [Fact]
    public void ResolveIdeasSeedPath_ContentRootHasFile_ReturnsContentRootPath()
    {
        string contentRoot = CreateSeedRoot("content");

        string? result = DatabaseSeederHostedService.ResolveIdeasSeedPath(contentRoot, Path.Combine(_root, "missing"));

        result.Should().Be(Path.Combine(contentRoot, "data/ideas/ideas_seed.sql"));
    }

    [Fact]
    public void ResolveIdeasSeedPath_FallsBackToBaseDirectory()
    {
        string emptyContentRoot = Directory.CreateDirectory(Path.Combine(_root, "empty")).FullName;

        string? result = DatabaseSeederHostedService.ResolveIdeasSeedPath(emptyContentRoot, AppContext.BaseDirectory);

        result.Should().Be(Path.Combine(AppContext.BaseDirectory, "data/ideas/ideas_seed.sql"));
    }

    [Fact]
    public void ResolveIdeasSeedPath_NeitherHasFile_ReturnsNull()
    {
        string emptyContentRoot = Directory.CreateDirectory(Path.Combine(_root, "empty")).FullName;
        string emptyBase = Directory.CreateDirectory(Path.Combine(_root, "emptybase")).FullName;

        DatabaseSeederHostedService.ResolveIdeasSeedPath(emptyContentRoot, emptyBase).Should().BeNull();
    }

    private string CreateSeedRoot(string name)
    {
        string root = Path.Combine(_root, name);
        Directory.CreateDirectory(Path.Combine(root, "data", "ideas"));
        File.WriteAllText(Path.Combine(root, "data", "ideas", "ideas_seed.sql"), "SELECT 1;");
        return root;
    }
}

[Trait("Category", "Postgres")]
public sealed class DatabaseSeederIdeasSeedPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private const string SeederUser = "seeder";

    [SkippableFact]
    public async Task IdeasSeed_IsIdempotent_DoesNotOverwriteEdits_AndReinsertsDeleted()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        // Seeder's own code path: StartAsync -> ResolveIdeasSeedPath (content root = test bin) -> SeedIdeasAsync.
        (CapturingLoggerProvider logs, _) = await DatabaseSeederStartHarness.RunAsync(fixture, "Production");
        logs.Entries.Should().Contain(e => e.Message.Contains("Ideas seed SQL applied."));
        logs.Entries.Should().NotContain(e => e.Message.Contains("Ideas seed SQL not found"));

        await using ApplicationDbContext db = fixture.CreateDbContext();
        List<Idea> seeded = await db.Ideas.Where(i => i.CreatedBy == SeederUser).OrderBy(i => i.Id).ToListAsync();
        seeded.Should().HaveCount(8);

        Idea edited = seeded[0];
        Guid editedId = edited.Id;
        Idea deleted = seeded[1];
        Guid deletedId = deleted.Id;
        edited.Title = "Edited by admin";
        edited.Status = IdeaStatus.Shipped;
        Guid userIdeaId = Guid.NewGuid();
        db.Ideas.Add(new Idea
        {
            Id = userIdeaId,
            Title = "User idea",
            Problem = "p",
            ProposedChange = "c",
            CreatedBy = "user-1",
        });
        db.Ideas.Remove(deleted);
        await db.SaveChangesAsync();

        await DatabaseSeederStartHarness.RunAsync(fixture, "Production");

        await using ApplicationDbContext verify = fixture.CreateDbContext();
        (await verify.Ideas.CountAsync(i => i.CreatedBy == SeederUser)).Should().Be(8);
        (await verify.Ideas.CountAsync()).Should().Be(9);

        Idea editedAfter = await verify.Ideas.SingleAsync(i => i.Id == editedId);
        editedAfter.Title.Should().Be("Edited by admin");
        editedAfter.Status.Should().Be(IdeaStatus.Shipped);

        Idea userAfter = await verify.Ideas.SingleAsync(i => i.Id == userIdeaId);
        userAfter.Title.Should().Be("User idea");
        userAfter.CreatedBy.Should().Be("user-1");

        (await verify.Ideas.AnyAsync(i => i.Id == deletedId)).Should().BeTrue("deleted seeded ideas are re-added (AC 4.9.11)");
    }
}
