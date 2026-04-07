# generate-user-guides-local.ps1
# Captures desktop and mobile user-guide screenshots from the local dev stack and regenerates
# docs/user-guide/user-guide.md and docs/user-guide/user-guide.mobile.md.
#
# Prerequisites: start Aspire first in a separate terminal:
#   cd src/Quizymode.Api.AppHost && dotnet run
#
# Usage:
#   .\scripts\generate-user-guides-local.ps1
#   .\scripts\generate-user-guides-local.ps1 -Password "your-password"

param(
    [string]$Password
)

if ($Password) { $env:TEST_USER_PASSWORD = $Password }

. "$PSScriptRoot\_e2e-common.ps1"

$react = $null
$exitCode = 1

try {
    Test-Prerequisites
    Assert-ApiIsUp
    $react = Start-ReactDevServer
    Wait-ForReact
    Invoke-AuthSetup

    $env:PLAYWRIGHT_BASE_URL = "http://localhost:7000"
    Push-Location $RepoRoot

    $desktopScreenshotDir = Join-Path $RepoRoot "docs\user-guide\screenshots\user"
    $mobileScreenshotDir = Join-Path $RepoRoot "docs\user-guide\screenshots\mobile"

    foreach ($dir in @($desktopScreenshotDir, $mobileScreenshotDir)) {
        if (Test-Path $dir) {
            Write-Host "Clearing previous screenshots in $dir..." -ForegroundColor Cyan
            Remove-Item -LiteralPath (Join-Path $dir "*.png") -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Capturing desktop and mobile screenshots from local dev stack..." -ForegroundColor Cyan
    npx playwright test --project=screenshots --project=screenshots-mobile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Screenshot capture had failures (non-zero exit). Proceeding to generate guides anyway." -ForegroundColor Yellow
    }

    Write-Host "Generating desktop and mobile user guides..." -ForegroundColor Cyan
    node scripts/generate-user-guide.js --all
    $exitCode = $LASTEXITCODE
    Pop-Location
} finally {
    Stop-ReactDevServer $react
}

foreach ($guideFile in @(
    (Join-Path $RepoRoot "docs\user-guide\user-guide.md"),
    (Join-Path $RepoRoot "docs\user-guide\user-guide.mobile.md")
)) {
    if (Test-Path $guideFile) {
        Write-Host ""
        Write-Host "User guide updated:" -ForegroundColor Green
        Write-Host "  $guideFile" -ForegroundColor White
    }
}

exit $exitCode
