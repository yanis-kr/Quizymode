using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.LearningLoop;

[Trait("Category", "Postgres")]
public sealed class InterestRefinementPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    [SkippableFact]
    public async Task MigrationPreservesLegacyRowsUpAndDownAndNullsAreNotDistinct()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        IMigrator migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261027195931_AddItemGroupLabel");
        Guid categoryId = Guid.NewGuid();
        DateTime createdAt = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"UserInterests\" (\"UserId\",\"CategoryId\",\"SortOrder\",\"CreatedAt\") VALUES ({"legacy-a"},{categoryId},{2},{createdAt}),({"legacy-b"},{categoryId},{0},{createdAt})");
        await migrator.MigrateAsync();
        List<UserInterest> rows = await db.UserInterests.AsNoTracking().OrderBy(row => row.UserId).ToListAsync();
        rows.Should().HaveCount(2);
        rows.Select(row => row.Id).Should().OnlyHaveUniqueItems().And.NotContain(Guid.Empty);
        rows.Select(row => row.CreatedAt).Should().AllBeEquivalentTo(createdAt);
        rows.Select(row => row.SortOrder).Should().Equal(2, 0);
        Func<Task> duplicate = () => db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"UserInterests\" (\"UserId\",\"CategoryId\",\"SortOrder\",\"CreatedAt\") VALUES ({"legacy-a"},{categoryId},{3},{createdAt})");
        (await duplicate.Should().ThrowAsync<PostgresException>()).Which.SqlState.Should().Be(PostgresErrorCodes.UniqueViolation);
        await migrator.MigrateAsync("20261027195931_AddItemGroupLabel");
        (await db.Database.SqlQueryRaw<int>("SELECT COUNT(*)::integer AS \"Value\" FROM \"UserInterests\"").SingleAsync()).Should().Be(2);
        (await db.Database.SqlQueryRaw<string>("SELECT \"UserId\" AS \"Value\" FROM \"UserInterests\" ORDER BY \"SortOrder\"").ToListAsync()).Should().Equal("legacy-b", "legacy-a");
        await migrator.MigrateAsync();
        Keyword french = new() { Id = Guid.NewGuid(), Name = "french", CreatedBy = "test" };
        UserInterest refined = new() { UserId = "refined-user", CategoryId = categoryId, NavigationKeywordId1 = french.Id };
        db.Keywords.Add(french);
        db.UserInterests.Add(refined);
        await db.SaveChangesAsync();
        Func<Task> unsafeRollback = () => migrator.MigrateAsync("20261027195931_AddItemGroupLabel");
        await unsafeRollback.Should().ThrowAsync<PostgresException>().WithMessage("*Cannot roll back while refined interests exist*");
        (await db.UserInterests.AsNoTracking().SingleAsync(row => row.Id == refined.Id)).NavigationKeywordId1.Should().Be(french.Id);
        db.UserInterests.Remove(refined);
        await db.SaveChangesAsync();
    }
}
