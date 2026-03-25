using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.StartupExtensions;

StartupExtensions.StartupLogger();
var builder = WebApplication.CreateBuilder(args);
builder.ConfigureServices();
var app = builder.Build();

// Apply pending migrations before the app accepts requests
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();
}

app.ConfigurePipeline();
await app.RunAsync();