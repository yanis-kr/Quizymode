using Quizymode.Api.StartupExtensions;

var builder = WebApplication.CreateBuilder(args);
builder.ConfigureServices();
var app = builder.Build();

// Migrations and seeding run in StartupGateService after Kestrel binds, so /health answers while they work (#732).
app.ConfigurePipeline();
await app.RunAsync();
