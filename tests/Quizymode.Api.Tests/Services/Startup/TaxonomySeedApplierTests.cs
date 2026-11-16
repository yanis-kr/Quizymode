using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services.Startup;

/// <summary>
/// Hash-gated taxonomy seed (#732). The seed SQL is replaced by a tiny script that inserts into a probe table, so each
/// execution of the script is visible as one probe row.
/// </summary>
public sealed class TaxonomySeedApplierTests : DatabaseTestFixture, IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "qm-taxseed-" + Guid.NewGuid().ToString("N"));

    public TaxonomySeedApplierTests()
    {
        Directory.CreateDirectory(_directory);
        DbContext.Database.ExecuteSqlRaw("CREATE TABLE SeedProbe (Value TEXT NOT NULL)");
    }

    private string WriteSeed(string name, string value)
    {
        string path = Path.Combine(_directory, name);
        File.WriteAllText(path, $"INSERT INTO SeedProbe (Value) VALUES ('{value}');");
        return path;
    }

    private int ProbeRows() =>
        DbContext.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM SeedProbe").AsEnumerable().Single();

    private Task<bool> ApplyAsync(string path, bool force = false) =>
        TaxonomySeedApplier.ApplyIfChangedAsync(DbContext, path, force, NullLogger.Instance, CancellationToken.None);

    [Fact]
    public async Task FirstRun_ExecutesSeed_AndStoresHash()
    {
        string path = WriteSeed("seed.sql", "a");

        (await ApplyAsync(path)).Should().BeTrue();

        ProbeRows().Should().Be(1);
        TaxonomySeedState state = await DbContext.TaxonomySeedStates.AsNoTracking().SingleAsync();
        state.Id.Should().Be(TaxonomySeedState.SingletonId);
        state.Sha256.Should().HaveLength(64).And.MatchRegex("^[0-9a-f]{64}$");
    }

    [Fact]
    public async Task UnchangedHash_DoesNotExecuteSeedSql()
    {
        string path = WriteSeed("seed.sql", "a");
        await ApplyAsync(path);

        (await ApplyAsync(path)).Should().BeFalse();
        (await ApplyAsync(path)).Should().BeFalse();

        ProbeRows().Should().Be(1, "an unchanged seed file must not be replayed");
    }

    [Fact]
    public async Task ChangedFile_ExecutesSeed_AndUpdatesStoredHashInTheSameRow()
    {
        string path = WriteSeed("seed.sql", "a");
        await ApplyAsync(path);
        string firstHash = (await DbContext.TaxonomySeedStates.AsNoTracking().SingleAsync()).Sha256;

        WriteSeed("seed.sql", "b");
        (await ApplyAsync(path)).Should().BeTrue();

        ProbeRows().Should().Be(2);
        List<TaxonomySeedState> rows = await DbContext.TaxonomySeedStates.AsNoTracking().ToListAsync();
        rows.Should().ContainSingle();
        rows[0].Sha256.Should().NotBe(firstHash);
    }

    [Fact]
    public async Task ForceSeed_ExecutesSeed_EvenWhenHashMatches()
    {
        string path = WriteSeed("seed.sql", "a");
        await ApplyAsync(path);

        (await ApplyAsync(path, force: true)).Should().BeTrue();

        ProbeRows().Should().Be(2);
        (await DbContext.TaxonomySeedStates.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task FailedSeed_RollsBackAndKeepsNoHash_SoItRetriesNextBoot()
    {
        string path = Path.Combine(_directory, "bad.sql");
        File.WriteAllText(path, "INSERT INTO SeedProbe (Value) VALUES ('a'); INSERT INTO MissingTable VALUES (1);");

        Func<Task> act = () => ApplyAsync(path);

        await act.Should().ThrowAsync<Exception>();
        ProbeRows().Should().Be(0);
        (await DbContext.TaxonomySeedStates.CountAsync()).Should().Be(0);
    }

    public new void Dispose()
    {
        base.Dispose();
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }
}
