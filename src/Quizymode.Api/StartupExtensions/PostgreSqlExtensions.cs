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
            options.UseNpgsql(connectionString));

        // Register DatabaseSeederHostedService for seeding
        builder.Services.AddHostedService<Services.DatabaseSeederHostedService>();

        return builder;
    }
}

