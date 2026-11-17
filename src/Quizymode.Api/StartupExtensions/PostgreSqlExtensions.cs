using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services.Startup;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddPostgreSqlServices(this WebApplicationBuilder builder)
    {
        string commandLine = Environment.CommandLine;
        bool isOpenApiGeneration =
            commandLine.Contains("dotnet-getdocument", StringComparison.OrdinalIgnoreCase) ||
            commandLine.Contains("GetDocument.Insider", StringComparison.OrdinalIgnoreCase);

        // Aspire automatically provides connection string as "quizymode" (the database name)
        // Falls back to appsettings.json connection string if not running in Aspire
        string rawConnectionString = builder.Configuration.GetConnectionString("quizymode")
            ?? builder.Configuration.GetConnectionString("PostgreSQL")
            ?? throw new InvalidOperationException("PostgreSQL connection string not found");

        // Cap the Npgsql pool (#339): Supavisor session mode allows 15 client slots in total.
        DatabaseOptions databaseOptions = builder.Configuration.GetSection(DatabaseOptions.SectionName).Get<DatabaseOptions>()
            ?? new DatabaseOptions();
        string connectionString = PostgreSqlConnectionStringDefaults.Apply(rawConnectionString, databaseOptions);

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddSingleton<Shared.DbConnectionFailureLogger>();
        builder.Services.AddDbContext<ApplicationDbContext>((serviceProvider, options) =>
        {
            options.UseNpgsql(connectionString);
            options.AddInterceptors(serviceProvider.GetRequiredService<Shared.DbConnectionFailureLogger>());
            
            // Suppress pending model changes warning to allow migrations to run
            // This is needed when model snapshot and configuration are temporarily out of sync during migrations
            options.ConfigureWarnings(warnings => 
                warnings.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
            
            // Enable sensitive data logging in Development to see actual parameter values
            if (builder.Environment.IsDevelopment())
            {
                options.EnableSensitiveDataLogging();
                options.EnableDetailedErrors();
            }
        });

        // Slow startup work (migrations, taxonomy seed, dev seed) runs in the background behind this gate so Kestrel binds
        // and /health answers straight away (#732). The OpenAPI build tool boots the app only to emit the contract, so it
        // skips the work and gets an open gate.
        StartupGate startupGate = new();
        builder.Services.AddSingleton(startupGate);
        if (isOpenApiGeneration)
        {
            startupGate.Open();
        }
        else
        {
            builder.Services.AddSingleton<IStartupMigrator, EfStartupMigrator>();
            // Order matters: the single migration first, then the seed.
            builder.Services.AddSingleton<IStartupGateStep, MigrationStartupStep>();
            builder.Services.AddSingleton<IStartupGateStep, Services.DatabaseSeederHostedService>();
            builder.Services.AddHostedService<StartupGateService>();
        }

        return builder;
    }
}

