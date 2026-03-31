# generate-user-guide-production.ps1
# Captures user-guide screenshots from the live production site and regenerates
# docs/user-guide/user-guide.md.
#
# No local servers required — screenshots are taken from https://www.quizymode.com
#
# Usage: .\scripts\generate-user-guide-production.ps1

. "$PSScriptRoot\_e2e-common.ps1"

$exitCode = 1

try {
    # Credentials are still needed because some screens require auth.
    Test-Prerequisites

    $screenshotDir = Join-Path $RepoRoot "docs\user-guide\screenshots\user"
    if (Test-Path $screenshotDir) {
        Write-Host "Clearing previous screenshots..." -ForegroundColor Cyan
        Remove-Item -LiteralPath (Join-Path $screenshotDir "*.png") -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Capturing screenshots from production..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    # No PLAYWRIGHT_BASE_URL set — config defaults to https://www.quizymode.com
    npx playwright test --project=screenshots
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Screenshot capture had failures (non-zero exit). Proceeding to generate guide anyway." -ForegroundColor Yellow
    }

    Write-Host "Generating user guide..." -ForegroundColor Cyan
    node scripts/generate-user-guide.js
    $exitCode = $LASTEXITCODE
    Pop-Location
} finally {
    # nothing to clean up
}

$guideFile = Join-Path $RepoRoot "docs\user-guide\user-guide.md"
if (Test-Path $guideFile) {
    Write-Host ""
    Write-Host "User guide updated:" -ForegroundColor Green
    Write-Host "  $guideFile" -ForegroundColor White
}

exit $exitCode
