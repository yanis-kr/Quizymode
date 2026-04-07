# generate-user-guides-production.ps1
# Captures desktop and mobile user-guide screenshots from the live production site and regenerates
# docs/user-guide/user-guide.md and docs/user-guide/user-guide.mobile.md.
#
# No local servers required - screenshots are taken from https://www.quizymode.com
#
# Usage: .\scripts\generate-user-guides-production.ps1

. "$PSScriptRoot\_e2e-common.ps1"

$exitCode = 1

try {
    Test-Prerequisites

    $desktopScreenshotDir = Join-Path $RepoRoot "docs\user-guide\screenshots\user"
    $mobileScreenshotDir = Join-Path $RepoRoot "docs\user-guide\screenshots\mobile"

    foreach ($dir in @($desktopScreenshotDir, $mobileScreenshotDir)) {
        if (Test-Path $dir) {
            Write-Host "Clearing previous screenshots in $dir..." -ForegroundColor Cyan
            Remove-Item -LiteralPath (Join-Path $dir "*.png") -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Capturing desktop and mobile screenshots from production..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    npx playwright test --project=screenshots --project=screenshots-mobile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Screenshot capture had failures (non-zero exit). Proceeding to generate guides anyway." -ForegroundColor Yellow
    }

    Write-Host "Generating desktop and mobile user guides..." -ForegroundColor Cyan
    node scripts/generate-user-guide.js --all
    $exitCode = $LASTEXITCODE
    Pop-Location
} finally {
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
