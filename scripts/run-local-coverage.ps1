param(
    [string]$OutputRoot = "artifacts/local-coverage",
    [string]$TestResultsRoot = "TestResults/local-coverage",
    [switch]$NoClean,
    [switch]$NoOpen,
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipArchitecture
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputRootPath = Join-Path $repoRoot $OutputRoot
$testResultsRootPath = Join-Path $repoRoot $TestResultsRoot
$frontendRoot = Join-Path $repoRoot "src/Quizymode.Web"
$frontendCoverageRoot = Join-Path $testResultsRootPath "frontend-coverage"
$legacyFrontendCoverageRoot = Join-Path $frontendRoot "coverage"
$architectureResultsPath = Join-Path $testResultsRootPath "architecture/architecture-tests.trx"
$backendCoverageDirectory = Join-Path $testResultsRootPath "backend-coverage"
$backendCoverageOutputBase = Join-Path $backendCoverageDirectory "coverage"
$backendCoveragePath = Join-Path $backendCoverageDirectory "coverage.cobertura.xml"
$backendExcludeByFile = "**/Migrations/*.cs%2c**/*.Designer.cs%2c**/*Snapshot.cs%2c**/*.generated.cs%2c**/obj/**"
$frontendCoberturaPath = Join-Path $frontendCoverageRoot "cobertura-coverage.xml"
$frontendSummaryJsonPath = Join-Path $frontendCoverageRoot "coverage-summary.json"
$reportDirectory = Join-Path $outputRootPath "report"
$summaryMarkdownPath = Join-Path $outputRootPath "coverage-summary.md"
$summaryJsonPath = Join-Path $outputRootPath "coverage-summary.json"
$reportSummaryPath = Join-Path $reportDirectory "Summary.txt"

function Remove-PathIfExists {
    param(
        [string]$Path
    )

    if (Test-Path $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Invoke-NativeCommand {
    param(
        [scriptblock]$Command,
        [string]$FailureMessage
    )

    & $Command

    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Ensure-ReportGenerator {
    $command = Get-Command reportgenerator -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    Write-Host "Installing dotnet-reportgenerator-globaltool..."
    Invoke-NativeCommand `
        -FailureMessage "Failed to install dotnet-reportgenerator-globaltool." `
        -Command { dotnet tool install --global dotnet-reportgenerator-globaltool | Out-Host }

    $command = Get-Command reportgenerator -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    $toolsPath = Join-Path $env:USERPROFILE ".dotnet\tools\reportgenerator.exe"
    if (Test-Path $toolsPath) {
        return $toolsPath
    }

    throw "reportgenerator was not found after installation."
}

function Convert-PathToFileUrl {
    param(
        [string]$Path
    )

    return ([System.Uri]$Path).AbsoluteUri
}

if (-not $NoClean) {
    Write-Host "Cleaning previous local coverage output..."
    Remove-PathIfExists -Path $outputRootPath
    Remove-PathIfExists -Path $testResultsRootPath
    Remove-PathIfExists -Path $legacyFrontendCoverageRoot
}

New-Item -ItemType Directory -Path $outputRootPath -Force | Out-Null
New-Item -ItemType Directory -Path $testResultsRootPath -Force | Out-Null

if (-not $SkipFrontend) {
    Write-Host "Running frontend coverage..."
    Push-Location $frontendRoot
    try {
        Invoke-NativeCommand `
            -FailureMessage "Frontend coverage run failed." `
            -Command { npx --no-install vitest run --coverage "--coverage.reportsDirectory=$frontendCoverageRoot" --testTimeout=10000 }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $frontendCoberturaPath)) {
        throw "Frontend coverage did not produce '$frontendCoberturaPath'."
    }
}

Remove-PathIfExists -Path $legacyFrontendCoverageRoot

if (-not $SkipArchitecture) {
    Write-Host "Running architecture tests..."
    Invoke-NativeCommand `
        -FailureMessage "Architecture test run failed." `
        -Command {
            dotnet test tests/Quizymode.Api.Tests/Quizymode.Api.Tests.csproj `
                --no-restore `
                --verbosity minimal `
                --filter "FullyQualifiedName~Architecture" `
                --logger "trx;LogFileName=architecture-tests.trx" `
                --results-directory (Join-Path $testResultsRootPath "architecture")
        }
}

if (-not $SkipBackend) {
    Write-Host "Running backend coverage..."
    New-Item -ItemType Directory -Path $backendCoverageDirectory -Force | Out-Null

    Invoke-NativeCommand `
        -FailureMessage "Backend coverage run failed." `
        -Command {
            dotnet test tests/Quizymode.Api.Tests/Quizymode.Api.Tests.csproj `
                --no-restore `
                --verbosity minimal `
                /p:CollectCoverage=true `
                /p:CoverletOutputFormat=cobertura `
                "/p:ExcludeByFile=$backendExcludeByFile" `
                "/p:CoverletOutput=$backendCoverageOutputBase" `
                "/p:Include=[Quizymode.Api]*"
        }

    if (-not (Test-Path $backendCoveragePath)) {
        throw "Backend coverage did not produce '$backendCoveragePath'."
    }
}

$reports = [System.Collections.Generic.List[string]]::new()
if (Test-Path $backendCoveragePath) {
    $reports.Add($backendCoveragePath)
}
if (Test-Path $frontendCoberturaPath) {
    $reports.Add($frontendCoberturaPath)
}

if ($reports.Count -eq 0) {
    throw "No coverage reports were produced. At least one of backend or frontend coverage must run successfully."
}

$reportGeneratorPath = Ensure-ReportGenerator

Write-Host "Generating merged HTML report..."
Invoke-NativeCommand `
    -FailureMessage "Merged HTML coverage report generation failed." `
    -Command {
        & $reportGeneratorPath `
            "-reports:$($reports -join ';')" `
            "-targetdir:$reportDirectory" `
            "-reporttypes:Html;HtmlSummary;TextSummary" `
            "-title:Quizymode Local Coverage"
    }

Write-Host "Generating markdown/json summary..."
& ./scripts/summarize-coverage.ps1 `
    -ResultsDirectory $testResultsRootPath `
    -MarkdownOutputPath $summaryMarkdownPath `
    -JsonOutputPath $summaryJsonPath `
    -FrontendCoverageJsonPath $frontendSummaryJsonPath `
    -ArchitectureResultsPath $architectureResultsPath

if ($LASTEXITCODE -ne 0) {
    throw "Coverage summary generation failed."
}

Write-Host ""
Write-Host "Local coverage artifacts:"
$htmlReportPath = Join-Path $reportDirectory "index.html"
$htmlReportUrl = Convert-PathToFileUrl -Path $htmlReportPath
$summaryMarkdownUrl = Convert-PathToFileUrl -Path $summaryMarkdownPath
$summaryJsonUrl = Convert-PathToFileUrl -Path $summaryJsonPath
Write-Host "  HTML report:    $htmlReportPath"
Write-Host "  HTML URL:       $htmlReportUrl"
Write-Host "  Markdown:       $summaryMarkdownPath"
Write-Host "  Markdown URL:   $summaryMarkdownUrl"
Write-Host "  JSON summary:   $summaryJsonPath"
Write-Host "  JSON URL:       $summaryJsonUrl"

if (Test-Path $reportSummaryPath) {
    Write-Host ""
    Write-Host "Merged report summary:"
    Get-Content $reportSummaryPath | Write-Host
}

if (-not $NoOpen) {
    Write-Host ""
    Write-Host "Opening HTML report in your default browser..."
    Start-Process $htmlReportPath
}
