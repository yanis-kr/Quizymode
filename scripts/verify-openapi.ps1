param(
    [string]$Configuration = "Release",
    [switch]$WarnOnlyOnArtifactDiff,
    [string]$DiffOutputPath = ""
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
$gitDiffOutput = git diff --exit-code --no-color -- $openApiArtifact | Out-String
$gitDiffExitCode = $LASTEXITCODE

$artifactDiffDetected = $gitDiffExitCode -eq 1
if ($artifactDiffDetected -and -not [string]::IsNullOrWhiteSpace($DiffOutputPath)) {
    $diffDirectory = Split-Path -Parent $DiffOutputPath
    if (-not [string]::IsNullOrWhiteSpace($diffDirectory)) {
        New-Item -ItemType Directory -Path $diffDirectory -Force | Out-Null
    }

    $gitDiffOutput | Set-Content -Path $DiffOutputPath -Encoding utf8NoBOM
}

if ($env:GITHUB_OUTPUT) {
    "artifact_diff_detected=$artifactDiffDetected" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    if (-not [string]::IsNullOrWhiteSpace($DiffOutputPath)) {
        "artifact_diff_path=$DiffOutputPath" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    }
}

if ($gitDiffExitCode -gt 1) {
    Write-Host "Failed to diff OpenAPI artifact." -ForegroundColor Red
    exit $gitDiffExitCode
}

if ($artifactDiffDetected) {
    Write-Host "OpenAPI artifact is out of date. Rebuild the API and commit the updated spec." -ForegroundColor Yellow

    if ($WarnOnlyOnArtifactDiff) {
        Write-Warning "OpenAPI artifact drift detected. Continuing because WarnOnlyOnArtifactDiff was specified."
        exit 0
    }

    exit 1
}

Write-Host "OpenAPI artifact is in sync." -ForegroundColor Green
