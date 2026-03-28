param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$apiProject = "src/Quizymode.Api/Quizymode.Api.csproj"
$openApiArtifact = "docs/openapi/quizymode-api.json"

Write-Host "Building API and generating OpenAPI document..." -ForegroundColor Cyan
dotnet build $apiProject --configuration $Configuration --nologo
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not (Test-Path $openApiArtifact)) {
    Write-Host "Expected OpenAPI artifact was not generated: $openApiArtifact" -ForegroundColor Red
    exit 1
}

Write-Host "Checking committed OpenAPI artifact is in sync..." -ForegroundColor Cyan
git diff --exit-code -- $openApiArtifact
if ($LASTEXITCODE -ne 0) {
    Write-Host "OpenAPI artifact is out of date. Rebuild the API and commit the updated spec." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "OpenAPI artifact is in sync." -ForegroundColor Green
