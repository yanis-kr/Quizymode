using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>
/// GetDatabaseSize uses PostgreSQL-specific SQL (pg_database_size) which is not supported
/// by the SQLite test database. These tests verify the failure path and response structure.
/// </summary>
public sealed class GetDatabaseSizeTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_OnSqlite_ReturnsFailure()
    {
        // The handler executes PostgreSQL-specific SQL which fails on SQLite
        var result = await GetDatabaseSize.HandleAsync(DbContext, CancellationToken.None);

        // SQLite does not support pg_database_size, so we expect an error
        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.GetDatabaseSizeFailed");
    }
}
