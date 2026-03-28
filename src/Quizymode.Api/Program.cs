using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.StartupExtensions;

StartupExtensions.StartupLogger();
string commandLine = Environment.CommandLine;
bool isOpenApiGeneration =
    commandLine.Contains("dotnet-getdocument", StringComparison.OrdinalIgnoreCase) ||
    commandLine.Contains("GetDocument.Insider", StringComparison.OrdinalIgnoreCase);
var builder = WebApplication.CreateBuilder(args);
builder.ConfigureServices();
var app = builder.Build();

// Build-time OpenAPI generation boots the app entrypoint. Skip database work in that mode
// so the contract can be generated without requiring a live PostgreSQL instance.
if (!isOpenApiGeneration)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();
}

app.ConfigurePipeline();
await app.RunAsync();
