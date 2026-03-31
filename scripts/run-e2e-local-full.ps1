# run-e2e-local-full.ps1
# Runs the full Playwright E2E suite against the local dev stack.
#
# Prerequisites: start Aspire first in a separate terminal:
#   cd src/Quizymode.Api.AppHost && dotnet run
#
# Usage: .\scripts\run-e2e-local-full.ps1

. "$PSScriptRoot\_e2e-common.ps1"

$react    = $null
$exitCode = 1

$runId    = "full-$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')"
$outputDir = Join-Path $RepoRoot "playwright\test-results\$runId"

try {
    Test-Prerequisites
    Assert-ApiIsUp
    $react = Start-ReactDevServer
    Wait-ForReact
    Invoke-AuthSetup

    $env:PLAYWRIGHT_BASE_URL = "http://localhost:7000"
    Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
    npx playwright test --project=e2e-full --output="$outputDir"
    $exitCode = $LASTEXITCODE
    Pop-Location

    Show-TestSummary
} finally {
    Stop-ReactDevServer $react
}

if (Test-Path $outputDir) {
    Write-Host ""
    Write-Host "Screenshots saved to:" -ForegroundColor Cyan
    Write-Host "  $outputDir" -ForegroundColor White
}

Remove-OldTestRuns

exit $exitCode
