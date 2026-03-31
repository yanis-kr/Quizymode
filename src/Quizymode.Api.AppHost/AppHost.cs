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
// Let the API bind directly to ports from launchSettings.json
// Aspire will auto-detect these endpoints and make them accessible
// Note: Port 6000 is blocked by Chrome, and 8080 is used by Docker/WSL, so we use 8082 for HTTPS
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

// Add the React/Vite dev server via AddExecutable (Aspire.Hosting.NodeJs is not yet released
// at the Aspire 13.x version, so we drive npm directly).
// vite.config.ts reads the PORT env var set here; falls back to 7000 for standalone npm run dev.
// Start the React/Vite dev server.
// Kill any stale process on port 7000 first so Vite always binds to the expected port.
// No endpoint registration needed — navigate to http://localhost:7000 directly.
string npmExe = OperatingSystem.IsWindows() ? "powershell.exe" : "sh";
string[] npmArgs = OperatingSystem.IsWindows()
    ? [
        "-NoProfile", "-Command",
        "Get-NetTCPConnection -LocalPort 7000 -ErrorAction SilentlyContinue " +
        "| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; " +
        "Start-Sleep -Milliseconds 300; " +
        "npm run dev"
      ]
    : ["-c", "fuser -k 7000/tcp 2>/dev/null; sleep 0.3; npm run dev"];

builder.AddExecutable("quizymode-web", npmExe, "../../src/Quizymode.Web", npmArgs)
    .WaitFor(api);

builder.Build().Run();
