# _e2e-common.ps1 — shared E2E helper functions.
# Not meant to be run directly. Sourced by run-e2e-local-*.ps1 via dot-sourcing.
#
# Assumes Aspire (API + DB) is already running before the script is called.
# Start it with: cd src/Quizymode.Api.AppHost && dotnet run

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

# ---------------------------------------------------------------------------
# Test-Prerequisites
# Verifies dotnet, node, npx, and credentials are present.
# ---------------------------------------------------------------------------
function Test-Prerequisites {
    $missing = @()

    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        $missing += "dotnet (.NET SDK 10 required)"
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        $missing += "node (Node.js 20.19+ or 22.12+ required)"
    }
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        $missing += "npx (bundled with Node.js)"
    }

    if ($missing.Count -gt 0) {
        Write-Host "Missing prerequisites:" -ForegroundColor Red
        $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        exit 1
    }

    # Email is fixed — override with TEST_USER_EMAIL env var if needed
    if (-not $env:TEST_USER_EMAIL) {
        $env:TEST_USER_EMAIL = "test-user@quizymode.com"
    }
    Write-Host "Test email: $($env:TEST_USER_EMAIL)" -ForegroundColor DarkGray

    # Prompt for password if not provided via env var
    if (-not $env:TEST_USER_PASSWORD) {
        $secure = Read-Host "Enter password for $($env:TEST_USER_EMAIL)" -AsSecureString
        $env:TEST_USER_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        )
        if (-not $env:TEST_USER_PASSWORD) {
            Write-Host "Password cannot be empty." -ForegroundColor Red
            exit 1
        }
    }

    Write-Host "Prerequisites OK." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Assert-ApiIsUp
# Checks that Aspire/API is already running using a TCP port test (avoids
# HTTPS certificate issues). Fails immediately if neither port responds.
# ---------------------------------------------------------------------------
function Assert-ApiIsUp {
    $ports = @(8082, 8080)

    Write-Host "Checking API is up..." -ForegroundColor Cyan

    foreach ($port in $ports) {
        $result = Test-NetConnection -ComputerName localhost -Port $port `
                    -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        if ($result.TcpTestSucceeded) {
            Write-Host "  API is up on port $port." -ForegroundColor Green
            return
        }
    }

    Write-Host "API is not reachable on ports 8080 or 8082. Start Aspire first:" -ForegroundColor Red
    Write-Host "  cd src/Quizymode.Api.AppHost && dotnet run" -ForegroundColor Yellow
    exit 1
}

# ---------------------------------------------------------------------------
# Start-ReactDevServer
# Starts `npm run dev` if port 7000 is not already in use.
# Returns the Process object, or $null if React was already running.
# ---------------------------------------------------------------------------
function Start-ReactDevServer {
    $already = Test-NetConnection -ComputerName localhost -Port 7000 `
                 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    if ($already.TcpTestSucceeded) {
        Write-Host "React dev server already running on port 7000." -ForegroundColor Green
        return $null
    }

    $webDir = Join-Path $RepoRoot "src\Quizymode.Web"
    $artifactsDir = Join-Path $RepoRoot ".artifacts"
    $stdoutLog = Join-Path $artifactsDir "react-dev-server.stdout.log"
    $stderrLog = Join-Path $artifactsDir "react-dev-server.stderr.log"
    $npmExe = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }

    New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null
    if (Test-Path $stdoutLog) { Remove-Item $stdoutLog -Force -ErrorAction SilentlyContinue }
    if (Test-Path $stderrLog) { Remove-Item $stderrLog -Force -ErrorAction SilentlyContinue }

    Write-Host "Starting React dev server..." -ForegroundColor Cyan

    $process = Start-Process `
        -FilePath $npmExe `
        -ArgumentList "run", "dev" `
        -WorkingDirectory $webDir `
        -PassThru `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog

    Start-Sleep -Seconds 2
    if ($process.HasExited) {
        Write-Host "React dev server exited immediately. Recent stderr:" -ForegroundColor Red
        if (Test-Path $stderrLog) {
            Get-Content $stderrLog | Select-Object -Last 20
        }
        exit 1
    }

    Write-Host "  Logs:" -ForegroundColor DarkGray
    Write-Host "    $stdoutLog" -ForegroundColor DarkGray
    Write-Host "    $stderrLog" -ForegroundColor DarkGray
    return $process
}

# ---------------------------------------------------------------------------
# Wait-ForReact
# Polls http://localhost:7000 until it responds or timeout expires.
# ---------------------------------------------------------------------------
function Wait-ForReact {
    param([int]$TimeoutSeconds = 60)

    $url      = "http://localhost:7000"
    $start    = Get-Date
    $deadline = $start.AddSeconds($TimeoutSeconds)

    Write-Host "Waiting for React dev server at $url ..." -ForegroundColor Cyan

    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest `
                -Uri $url `
                -UseBasicParsing `
                -TimeoutSec 3 `
                -ErrorAction Stop
            if ($r.StatusCode -lt 400) {
                Write-Host "  React dev server is up." -ForegroundColor Green
                return
            }
        } catch { }
        $elapsed = [int]((Get-Date) - $start).TotalSeconds
        Write-Host "`r  ${elapsed}s elapsed..." -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds 2
    }

    Write-Host ""
    Write-Host "React dev server did not start within $TimeoutSeconds seconds." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Invoke-AuthSetup
# Runs the Playwright auth-setup project to persist session state.
# ---------------------------------------------------------------------------
function Invoke-AuthSetup {
    Write-Host "Running Playwright auth setup..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        npx playwright test --project=auth-setup
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Auth setup failed." -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
    Write-Host "Auth setup complete." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Stop-ReactDevServer
# Terminates the React dev server only if this script started it.
# If $null is passed (was already running), leaves it alone.
# ---------------------------------------------------------------------------
function Stop-ReactDevServer {
    param($ReactProcess)

    if ($ReactProcess -and -not $ReactProcess.HasExited) {
        Stop-Process -Id $ReactProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "React dev server stopped." -ForegroundColor Cyan
    }
}

# ---------------------------------------------------------------------------
# Remove-OldTestRuns
# Deletes dated subfolders under playwright/test-results/ that are older
# than $AgeDays days (default: 7).
# ---------------------------------------------------------------------------
function Remove-OldTestRuns {
    param([int]$AgeDays = 7)

    $runsDir = Join-Path $RepoRoot "playwright\test-results"
    if (-not (Test-Path $runsDir)) { return }

    $cutoff = (Get-Date).AddDays(-$AgeDays)
    $deleted = 0

    Get-ChildItem -Path $runsDir -Directory |
        Where-Object { $_.CreationTime -lt $cutoff } |
        ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            $deleted++
        }

    if ($deleted -gt 0) {
        Write-Host "Removed $deleted test-run folder(s) older than $AgeDays days." -ForegroundColor DarkGray
    }
}

# ---------------------------------------------------------------------------
# Show-TestSummary
# Parses playwright-report/results.json, prints an AC-ID table, and opens
# the HTML report.
# ---------------------------------------------------------------------------
function Show-TestSummary {
    Write-Host ""
    Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host " Test Summary" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan

    $resultsFile = Join-Path $RepoRoot "playwright-report\results.json"

    if (-not (Test-Path $resultsFile)) {
        Write-Host "No results file found at $resultsFile" -ForegroundColor Yellow
    } else {
        $json = Get-Content $resultsFile -Raw | ConvertFrom-Json
        $acPattern = 'AC\s+\d+(?:\.\d+)+'
        $rows = [System.Collections.Generic.List[PSCustomObject]]::new()

        function Collect-Tests($suite) {
            foreach ($spec in $suite.specs) {
                foreach ($test in $spec.tests) {
                    $status = switch ($test.status) {
                        "expected"   { "PASS" }
                        "unexpected" { "FAIL" }
                        "flaky"      { "FLAKY" }
                        default      { $test.status.ToUpper() }
                    }
                    $title = "$($suite.title) › $($spec.title)".TrimStart(" › ")
                    $acIds = ([regex]::Matches($title, $acPattern) | ForEach-Object { $_.Value }) -join ", "
                    $rows.Add([PSCustomObject]@{
                        Status = $status
                        AC     = if ($acIds) { $acIds } else { "-" }
                        Test   = $title
                    })
                }
            }
            foreach ($child in $suite.suites) { Collect-Tests $child }
        }

        foreach ($suite in $json.suites) { Collect-Tests $suite }

        if ($rows.Count -gt 0) {
            $rows | Format-Table Status, AC, Test -AutoSize
        }

        $passed = ($rows | Where-Object { $_.Status -eq "PASS" }).Count
        $failed = ($rows | Where-Object { $_.Status -eq "FAIL" }).Count
        $flaky  = ($rows | Where-Object { $_.Status -eq "FLAKY" }).Count
        $color  = if ($failed -eq 0) { "Green" } else { "Red" }
        Write-Host "Passed: $passed  Failed: $failed  Flaky: $flaky" -ForegroundColor $color
    }

    $htmlReport = Join-Path $RepoRoot "playwright-report\index.html"
    if (Test-Path $htmlReport) {
        Write-Host "Opening HTML report..." -ForegroundColor Cyan
        Start-Process $htmlReport
    }
}
