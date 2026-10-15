param(
    [string]$Configuration = "Release",
    [switch]$WarnOnlyOnArtifactDiff,
    [string]$DiffOutputPath = ""
)

$ErrorActionPreference = "Stop"
# Exit codes of native commands are checked explicitly below. On PowerShell 7.3+ this keeps a
# non-zero exit (git diff --exit-code returns 1 for drift) from becoming a terminating error.
$PSNativeCommandUseErrorActionPreference = $false

$apiProject = "src/Quizymode.Api/Quizymode.Api.csproj"
$openApiArtifact = "docs/openapi/quizymode-api.json"

# Runs git and returns its exit code, stdout and stderr separately. Git writes advisory warnings
# (for example "LF will be replaced by CRLF") to stderr even when it succeeds, and Windows
# PowerShell turns redirected native stderr into NativeCommandError records, which would abort
# the script under $ErrorActionPreference = "Stop". Success or failure is decided by the exit code.
function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $previousPreference = $ErrorActionPreference
    $previousOutputEncoding = [Console]::OutputEncoding
    $ErrorActionPreference = "Continue"
    try {
        [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        $output = @(& git @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        [Console]::OutputEncoding = $previousOutputEncoding
        $ErrorActionPreference = $previousPreference
    }

    $stdoutLines = @($output | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
    $stderrLines = @($output | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object { $_.Exception.Message })

    return [pscustomobject]@{
        ExitCode = $exitCode
        StdOut = ($stdoutLines -join "`n")
        StdErr = $stderrLines
    }
}

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
$gitDiff = Invoke-Git -Arguments @("diff", "--exit-code", "--no-color", "--", $openApiArtifact)
$gitDiffExitCode = $gitDiff.ExitCode

if ($gitDiffExitCode -ne 0 -and $gitDiffExitCode -ne 1) {
    foreach ($line in $gitDiff.StdErr) {
        Write-Host "git: $line" -ForegroundColor Red
    }

    Write-Host "Failed to diff OpenAPI artifact (git exit code $gitDiffExitCode)." -ForegroundColor Red
    exit $gitDiffExitCode
}

foreach ($line in $gitDiff.StdErr) {
    Write-Warning "git: $line"
}

$artifactDiffDetected = $gitDiffExitCode -eq 1
if ($artifactDiffDetected -and -not [string]::IsNullOrWhiteSpace($DiffOutputPath)) {
    $diffDirectory = Split-Path -Parent $DiffOutputPath
    if (-not [string]::IsNullOrWhiteSpace($diffDirectory)) {
        New-Item -ItemType Directory -Path $diffDirectory -Force | Out-Null
    }

    # utf8NoBOM is not available on Windows PowerShell 5.1, so write the bytes directly.
    $resolvedDiffPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $DiffOutputPath))
    [System.IO.File]::WriteAllText($resolvedDiffPath, $gitDiff.StdOut + "`n", [System.Text.UTF8Encoding]::new($false))
}

if ($env:GITHUB_OUTPUT) {
    "artifact_diff_detected=$artifactDiffDetected" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    if (-not [string]::IsNullOrWhiteSpace($DiffOutputPath)) {
        "artifact_diff_path=$DiffOutputPath" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    }
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
