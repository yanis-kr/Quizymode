# generate-user-guide-production.ps1
# Captures desktop user-guide screenshots from the live production site and regenerates
# docs/user-guide/user-guide.md.
#
# No local servers required - screenshots are taken from https://www.quizymode.com
#
# Usage: .\scripts\generate-user-guide-production.ps1

. "$PSScriptRoot\_e2e-common.ps1"

$exitCode = 1

try {
    Test-Prerequisites

    $screenshotDir = Join-Path $RepoRoot "docs\user-guide\screenshots\user"
    if (Test-Path $screenshotDir) {
        Write-Host "Clearing previous desktop screenshots..." -ForegroundColor Cyan
        Remove-Item -LiteralPath (Join-Path $screenshotDir "*.png") -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Capturing desktop screenshots from production..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    npx playwright test --project=screenshots
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Desktop screenshot capture had failures (non-zero exit). Proceeding to generate guide anyway." -ForegroundColor Yellow
    }

    Write-Host "Generating desktop user guide..." -ForegroundColor Cyan
    node scripts/generate-user-guide.js --guide desktop
    $exitCode = $LASTEXITCODE
    Pop-Location
} finally {
}

$guideFile = Join-Path $RepoRoot "docs\user-guide\user-guide.md"
if (Test-Path $guideFile) {
    Write-Host ""
    Write-Host "Desktop user guide updated:" -ForegroundColor Green
    Write-Host "  $guideFile" -ForegroundColor White
}

exit $exitCode
