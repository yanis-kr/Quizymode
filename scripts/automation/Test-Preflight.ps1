[CmdletBinding()]
param([switch]$ValidateModels)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
$failures = New-Object Collections.Generic.List[string]
$warnings = New-Object Collections.Generic.List[string]

foreach ($command in @('powershell.exe', 'git.exe', 'gh.exe', 'codex.exe', 'claude.exe', 'dotnet.exe', 'node.exe', 'npm.cmd')) {
    if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) { $failures.Add("Missing command: $command") }
}
if ($PSVersionTable.PSVersion.Major -lt 5) { $failures.Add('Windows PowerShell 5.1 or later is required.') }
$pester = @(Get-Module -ListAvailable Pester | Where-Object { $_.Version.Major -lt 5 } | Sort-Object Version -Descending | Select-Object -First 1)
if ($pester.Count -eq 0) { $failures.Add('Pester 3.4.0-4.x is required for controller tests (legacy Should syntax; Pester 5 removes it).') }
elseif ($pester[0].Version -lt [Version]'3.4.0') { $failures.Add('Pester 3.4.0 or later is required.') }

if ($config.StateRoot.StartsWith((Get-QmRepositoryRoot), [StringComparison]::OrdinalIgnoreCase)) { $failures.Add('Runtime state must be outside the repository.') }
$gh = Invoke-QmNative -FilePath 'gh.exe' -Arguments @('auth', 'status') -TimeoutSeconds 30
if ($gh.ExitCode -ne 0) { $failures.Add('GitHub CLI subscription/session authentication is unavailable.') }
$codex = Invoke-QmNative -FilePath 'codex.exe' -Arguments @('doctor', '--summary', '--no-color') -WorkingDirectory (Get-QmRepositoryRoot) -TimeoutSeconds 90
if ($codex.ExitCode -ne 0) { $failures.Add('Codex doctor failed; inspect it interactively before live mode.') }
$claude = Invoke-QmNative -FilePath 'claude.exe' -Arguments @('auth', 'status') -TimeoutSeconds 30
if ($claude.ExitCode -ne 0) { $warnings.Add('Claude subscription authentication is unavailable; its adapter is disabled by default.') }

$modelResults = @()
if ($ValidateModels -and $failures.Count -eq 0) {
    foreach ($model in @('gpt-6.1-sol', 'gpt-6-luna')) {
        $result = Invoke-QmNative -FilePath 'codex.exe' -Arguments @('exec', '--ephemeral', '--model', $model, '--sandbox', 'read-only', '--cd', (Get-QmRepositoryRoot), 'Reply with exactly READY.') -WorkingDirectory (Get-QmRepositoryRoot) -TimeoutSeconds 180
        $modelResults += [pscustomobject]@{ model = $model; available = $result.ExitCode -eq 0 -and $result.StdOut -match 'READY' }
        if (-not $modelResults[-1].available) { $failures.Add("Configured subscription model is unavailable: $model") }
    }
}

[pscustomobject]@{
    passed = $failures.Count -eq 0
    powershell = $PSVersionTable.PSVersion.ToString()
    pester = if ($pester.Count -gt 0) { $pester[0].Version.ToString() } else { $null }
    dryRunDefault = $config.DryRunByDefault
    releaseEnabled = $config.ReleaseEnabled
    stateRoot = $config.StateRoot
    modelChecks = $modelResults
    warnings = @($warnings)
    failures = @($failures)
} | ConvertTo-Json -Depth 10
if ($failures.Count -gt 0) { exit 1 }
