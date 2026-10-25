using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Quizymode.Api.Data;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Search;

/// <summary>#319-1: the AddGlobalSearchIndexes migration applies, rolls back cleanly and re-applies. Requires Docker.</summary>
[Trait("Category", "Postgres")]
public sealed class SearchMigrationPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private const string PreviousMigration = "20261022084822_AddStudySessionMode";
    private const string SearchMigration = "20261025012911_AddGlobalSearchIndexes";

    [SkippableFact]
    public async Task Migration_AppliesRollsBackAndReapplies()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        IMigrator migrator = db.GetService<IMigrator>();

        await migrator.MigrateAsync(PreviousMigration);
        (await CountAsync(db, ColumnsSql)).Should().Be(0);
        (await CountAsync(db, IndexesSql)).Should().Be(0);

        await migrator.MigrateAsync(SearchMigration);
        (await CountAsync(db, ColumnsSql)).Should().Be(2);
        (await CountAsync(db, IndexesSql)).Should().Be(3);

        await migrator.MigrateAsync(PreviousMigration);
        (await CountAsync(db, ColumnsSql)).Should().Be(0);
        (await CountAsync(db, IndexesSql)).Should().Be(0);
        (await CountAsync(db, """SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'""")).Should().Be(1, "the extension is intentionally kept");

        await migrator.MigrateAsync();
        (await CountAsync(db, ColumnsSql)).Should().Be(2);
        (await CountAsync(db, IndexesSql)).Should().Be(3);
    }

    private const string ColumnsSql = """SELECT count(*) FROM information_schema.columns WHERE column_name = 'SearchVector' AND table_name IN ('Items','Collections')""";

    private const string IndexesSql = """SELECT count(*) FROM pg_indexes WHERE indexname IN ('IX_Items_SearchVector','IX_Collections_SearchVector','IX_Collections_Name_Trgm')""";

    private static async Task<long> CountAsync(ApplicationDbContext db, string sql)
    {
        System.Data.Common.DbConnection connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync();
        }

        await using System.Data.Common.DbCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }
}
