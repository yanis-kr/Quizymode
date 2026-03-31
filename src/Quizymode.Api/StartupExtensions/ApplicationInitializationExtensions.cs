using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    internal static Task InitializeApplicationAsync(this WebApplication app)
    {
        if (IsOpenApiGeneration())
        {
            return Task.CompletedTask;
        }

        return ApplyDatabaseMigrationsAsync(app);
    }

    private static bool IsOpenApiGeneration()
    {
        string commandLine = Environment.CommandLine;
        return
            commandLine.Contains("dotnet-getdocument", StringComparison.OrdinalIgnoreCase) ||
            commandLine.Contains("GetDocument.Insider", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task ApplyDatabaseMigrationsAsync(WebApplication app)
    {
        // Runtime startup applies pending migrations before the request pipeline begins.
        using IServiceScope scope = app.Services.CreateScope();
        ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();
    }
}
