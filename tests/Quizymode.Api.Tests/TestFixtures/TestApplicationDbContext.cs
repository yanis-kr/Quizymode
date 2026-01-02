using System.Linq;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Quizymode.Api.Data;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>
/// Custom model customizer for tests that removes PostgreSQL-specific SQL for SQLite compatibility.
/// </summary>
internal sealed class TestModelCustomizer : ModelCustomizer
{
    public TestModelCustomizer(ModelCustomizerDependencies dependencies)
        : base(dependencies)
    {
    }

    public override void Customize(ModelBuilder modelBuilder, DbContext context)
    {
        base.Customize(modelBuilder, context);

        // Override PostgreSQL-specific configurations for SQLite compatibility
        foreach (Microsoft.EntityFrameworkCore.Metadata.IMutableEntityType entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (Microsoft.EntityFrameworkCore.Metadata.IMutableProperty property in entityType.GetProperties())
            {
                // Remove gen_random_uuid() default
                string? defaultValueSql = property.GetDefaultValueSql();
                if (defaultValueSql is not null && defaultValueSql.Contains("gen_random_uuid()"))
                {
                    property.SetDefaultValueSql(null);
                }

                // Convert PostgreSQL-specific column types to SQLite-compatible types
                string? columnType = property.GetColumnType();
                if (columnType is not null)
                {
                    if (columnType == "jsonb")
                    {
                        property.SetColumnType("text");
                    }
                    else if (columnType == "timestamp with time zone" || columnType == "timestamp without time zone")
                    {
                        property.SetColumnType(null); // Use default datetime type for SQLite
                    }
                    else if (columnType.StartsWith("character varying"))
                    {
                        property.SetColumnType(null); // Use default string type for SQLite
                    }
                    else if (columnType == "uuid")
                    {
                        property.SetColumnType("text"); // SQLite doesn't have native UUID type
                    }
                }
            }

            // Remove all check constraints for SQLite compatibility
            // PostgreSQL check constraints may use PostgreSQL-specific syntax (quoted identifiers, :: cast operator, etc.)
            // We need to collect all constraint names first, then remove them, because modifying the collection while iterating causes issues
            List<string> constraintNames = entityType.GetCheckConstraints()
                .Select(c => c.Name)
                .Where(name => name is not null)
                .Cast<string>()
                .ToList();
            
            foreach (string constraintName in constraintNames)
            {
                entityType.RemoveCheckConstraint(constraintName);
            }
        }
    }
}

