using Aspire.Hosting.ApplicationModel;
using Microsoft.Extensions.Configuration;
using System.Diagnostics;
using System.Net.Sockets;

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

static int GetLocalPostgresPort(IConfiguration configuration)
{
    int? configuredPort = configuration.GetValue<int?>("LocalInfrastructure:Postgres:Port");
    return configuredPort ?? 55432;
}

// Kill any stale processes on known ports before Aspire starts resources.
// This prevents "port already in use" failures when VS is restarted after a force-kill.
if (OperatingSystem.IsWindows())
{
    foreach (int port in new[] { 8082, 7000 })
        KillPortWindows(port);
}

static void KillPortWindows(int port)
{
    using Process? p = Process.Start(new ProcessStartInfo("powershell.exe",
        $"-NoProfile -Command \"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue " +
        $"| ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}\"")
    {
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
    });
    p?.WaitForExit(3_000);
}

var builder = DistributedApplication.CreateBuilder(args);

string postgresUserName = builder.Configuration["LocalInfrastructure:Postgres:Username"] ?? "postgres";
int postgresPort = GetLocalPostgresPort(builder.Configuration);
string? configuredPostgresPassword = builder.Configuration["LocalInfrastructure:Postgres:Password"];
var postgresUserParameter = builder.AddParameter(
    "postgres-username",
    postgresUserName,
    publishValueAsDefault: true,
    secret: false);
var postgresPasswordParameter = string.IsNullOrWhiteSpace(configuredPostgresPassword)
    ? builder.AddParameter(
        "postgres-password",
        new GenerateParameterDefault
        {
            MinLength = 24,
            Lower = true,
            Upper = true,
            Numeric = true,
            Special = true,
            MinLower = 1,
            MinUpper = 1,
            MinNumeric = 1,
            MinSpecial = 1
        },
        secret: true,
        persist: true)
    : builder.AddParameter(
        "postgres-password",
        configuredPostgresPassword,
        publishValueAsDefault: false,
        secret: true);

// Add PostgreSQL with a fixed local port and persisted credentials so local tooling can rely on stable values.
var postgres = builder
    .AddPostgres("postgres", postgresUserParameter, postgresPasswordParameter)
    .WithEndpoint("tcp", endpoint =>
    {
        endpoint.Port = postgresPort;
        endpoint.TargetPort = 5432;
        endpoint.Protocol = ProtocolType.Tcp;
        endpoint.UriScheme = "tcp";
        endpoint.IsProxied = false;
    }, createIfNotExists: false)
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
// No endpoint registration needed — navigate to http://localhost:7000 directly.
// Stale processes on port 7000 are already killed above before Aspire starts.
string npmExe = OperatingSystem.IsWindows() ? "cmd.exe" : "sh";
string[] npmArgs = OperatingSystem.IsWindows()
    ? ["/c", "npm run dev"]
    : ["-c", "npm run dev"];

builder.AddExecutable("quizymode-web", npmExe, "../../src/Quizymode.Web", npmArgs)
    .WaitFor(api);

builder.Build().Run();
