using Quizymode.Api.StartupExtensions;
using Serilog;

StartupLogger();
var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog();
builder.ConfigureServices();
var app = builder.Build();
app.ConfigurePipeline();

app.Run();

void StartupLogger()
{
    Log.Logger = new LoggerConfiguration()
        .MinimumLevel.Debug()
        .WriteTo.Console()
        .CreateLogger();

    Log.Information("Starting QuizyMode Web API");
}
