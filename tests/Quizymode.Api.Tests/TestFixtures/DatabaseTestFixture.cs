using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Quizymode.Api.Data;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>
/// Base fixture for tests that need a database context.
/// Provides an isolated SQLite in-memory database for each test.
/// </summary>
public abstract class DatabaseTestFixture : IDisposable
{
    private readonly SqliteConnection _connection;
    protected ApplicationDbContext DbContext { get; }

    protected DatabaseTestFixture()
    {
        // Create and open a connection to keep the in-memory database alive
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        DbContextOptions<ApplicationDbContext> options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .ReplaceService<IModelCustomizer, TestModelCustomizer>()
            .EnableSensitiveDataLogging()
            .Options;

        DbContext = new ApplicationDbContext(options);
        
        // Ensure database is created - create database directly from model
        // Disable migrations completely to avoid PostgreSQL-specific SQL from migrations
        // The TestModelCustomizer handles PostgreSQL-specific SQL conversion for SQLite
        try
        {
            // Get the database creator and ensure migrations are not used
            IRelationalDatabaseCreator databaseCreator = DbContext.Database.GetService<IRelationalDatabaseCreator>();
            
            // EnsureCreated creates from model, not migrations, but we need to make sure
            // no migration history table is created or checked
            DbContext.Database.EnsureCreated();
        }
        catch (Microsoft.Data.Sqlite.SqliteException ex) when (ex.Message.Contains("unrecognized token"))
        {
            // If EnsureCreated fails due to migration SQL, provide better error message
            throw new InvalidOperationException(
                $"Database creation failed due to PostgreSQL-specific SQL. " +
                $"Error: {ex.Message}. " +
                $"Ensure TestModelCustomizer properly handles all PostgreSQL-specific syntax.", ex);
        }
    }

    public void Dispose()
    {
        DbContext.Dispose();
        _connection.Dispose();
    }
}

