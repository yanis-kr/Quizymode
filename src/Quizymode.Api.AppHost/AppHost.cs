using Microsoft.Extensions.Configuration;

static string GetAudienceValue(IConfiguration configuration)
{
    string? configuredAudience = configuration["Authentication:Cognito:Audience"];
    string? clientId = configuration["Authentication:Cognito:ClientId"];
    
    // If audience is not configured or is empty, use clientId
    if (string.IsNullOrWhiteSpace(configuredAudience))
    {
        if (string.IsNullOrWhiteSpace(clientId))
        {
            throw new InvalidOperationException("Authentication:Cognito:ClientId must be configured in AppHost appsettings.json or user secrets");
        }
        return clientId;
    }
    return configuredAudience;
}

var builder = DistributedApplication.CreateBuilder(args);

// Add PostgreSQL with pgAdmin for database management
var postgres = builder
    .AddPostgres("postgres")
    .WithPgAdmin();

var postgresDb = postgres.AddDatabase("quizymode");

// Add the API project
// Ports are configured in launchSettings.json (HTTPS: 8080, HTTP: 8081)
// Aspire will automatically use these ports from the project's launchSettings.json
// Note: Port 6000 is blocked by Chrome, so we use 8080 instead
var api = builder.AddProject("quizymode-api", "../Quizymode.Api/Quizymode.Api.csproj")
    .WithReference(postgresDb)
    .WaitFor(postgresDb)
    // Configure Cognito authentication settings
    // These can be overridden via user secrets or environment variables
    // To set via user secrets: dotnet user-secrets set "Authentication:Cognito:Authority" "..." --project Quizymode.Api.AppHost
    .WithEnvironment("APP_Authentication__Cognito__Authority", 
        builder.Configuration["Authentication:Cognito:Authority"] 
        ?? throw new InvalidOperationException("Authentication:Cognito:Authority must be configured in AppHost appsettings.json or user secrets"))
    .WithEnvironment("APP_Authentication__Cognito__ClientId", 
        builder.Configuration["Authentication:Cognito:ClientId"] 
        ?? throw new InvalidOperationException("Authentication:Cognito:ClientId must be configured in AppHost appsettings.json or user secrets"))
    .WithEnvironment("APP_Authentication__Cognito__Audience", 
        GetAudienceValue(builder.Configuration));

// Web UI is run separately via `npm run dev` in the Quizymode.Web directory
// This provides better developer experience with direct access to Vite output and easier debugging
// See README.md for instructions on running the Web UI

builder.Build().Run();
