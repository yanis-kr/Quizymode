# generate-user-guide-local.ps1
# Captures user-guide screenshots from the local dev stack and regenerates
# docs/user-guide/README.md.
#
# Prerequisites: start Aspire first in a separate terminal:
#   cd src/Quizymode.Api.AppHost && dotnet run
#
# Usage: .\scripts\generate-user-guide-local.ps1

. "$PSScriptRoot\_e2e-common.ps1"

$react    = $null
$exitCode = 1

try {
    Test-Prerequisites
    Assert-ApiIsUp
    $react = Start-ReactDevServer
    Wait-ForReact
    Invoke-AuthSetup

    $env:PLAYWRIGHT_BASE_URL = "http://localhost:7000"
    Push-Location $RepoRoot

    Write-Host "Capturing screenshots from local dev stack..." -ForegroundColor Cyan
    npx playwright test --project=screenshots
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Screenshot capture had failures (non-zero exit). Proceeding to generate guide anyway." -ForegroundColor Yellow
    }

    Write-Host "Generating user guide..." -ForegroundColor Cyan
    node scripts/generate-user-guide.js
    $exitCode = $LASTEXITCODE
    Pop-Location
} finally {
    Stop-ReactDevServer $react
}

$guideFile = Join-Path $RepoRoot "docs\user-guide\README.md"
if (Test-Path $guideFile) {
    Write-Host ""
    Write-Host "User guide updated:" -ForegroundColor Green
    Write-Host "  $guideFile" -ForegroundColor White
}

exit $exitCode
