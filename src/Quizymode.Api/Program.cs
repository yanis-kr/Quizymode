using Quizymode.Api.StartupExtensions;

var builder = WebApplication.CreateBuilder(args);
builder.ConfigureServices();
var app = builder.Build();

await app.InitializeApplicationAsync();
app.ConfigurePipeline();
await app.RunAsync();
