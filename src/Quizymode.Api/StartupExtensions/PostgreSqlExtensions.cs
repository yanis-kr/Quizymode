using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;

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
        string connectionString = builder.Configuration.GetConnectionString("quizymode") 
            ?? builder.Configuration.GetConnectionString("PostgreSQL") 
            ?? throw new InvalidOperationException("PostgreSQL connection string not found");

        builder.Services.AddDbContext<ApplicationDbContext>(options =>
        {
            options.UseNpgsql(connectionString);
            
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

        if (!isOpenApiGeneration)
        {
            // Register DatabaseSeederHostedService for normal app startup. Skip it when the
            // OpenAPI build tool boots the app solely to emit the contract document.
            builder.Services.AddHostedService<Services.DatabaseSeederHostedService>();
        }

        return builder;
    }
}

