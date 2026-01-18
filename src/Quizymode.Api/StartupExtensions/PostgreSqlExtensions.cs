using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddPostgreSqlServices(this WebApplicationBuilder builder)
    {
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

        // Register DatabaseSeederHostedService for seeding
        builder.Services.AddHostedService<Services.DatabaseSeederHostedService>();

        return builder;
    }
}

