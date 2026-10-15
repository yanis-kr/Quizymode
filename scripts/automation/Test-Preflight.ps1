[CmdletBinding()]
param([switch]$ValidateModels)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
$failures = New-Object Collections.Generic.List[string]
$warnings = New-Object Collections.Generic.List[string]

foreach ($command in @('powershell.exe', 'git.exe', 'gh.exe', 'codex.exe', 'claude.exe', 'dotnet.exe', 'node.exe', 'npm.cmd')) {
    if ($null -eq (Resolve-QmExecutable -Name $command)) { $failures.Add("Missing command: $command") }
}
foreach ($command in @('pg_dump.exe', 'pg_restore.exe', 'createdb.exe', 'dropdb.exe')) {
    if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) { $failures.Add("Missing destructive-migration safety prerequisite: $command") }
}
if (-not (Test-Path -LiteralPath (Join-Path (Get-QmRepositoryRoot) ".github\workflows\$($config.RollbackWorkflowFile)"))) { $failures.Add('Configured rollback workflow file is missing.') }
if ($PSVersionTable.PSVersion.Major -lt 5) { $failures.Add('Windows PowerShell 5.1 or later is required.') }
$pester = @(Get-Module -ListAvailable Pester | Where-Object { $_.Version.Major -lt 5 } | Sort-Object Version -Descending | Select-Object -First 1)
if ($pester.Count -eq 0) { $failures.Add('Pester 3.4.0-4.x is required for controller tests (legacy Should syntax; Pester 5 removes it).') }
elseif ($pester[0].Version -lt [Version]'3.4.0') { $failures.Add('Pester 3.4.0 or later is required.') }

if ($config.StateRoot.StartsWith((Get-QmRepositoryRoot), [StringComparison]::OrdinalIgnoreCase)) { $failures.Add('Runtime state must be outside the repository.') }
$ghPath = Resolve-QmExecutable -Name 'gh.exe'
$gh = if ($null -ne $ghPath) { Invoke-QmNative -FilePath $ghPath -Arguments @('auth', 'status') -TimeoutSeconds 30 } else { [pscustomobject]@{ ExitCode = 1 } }
if ($gh.ExitCode -ne 0) { $failures.Add('GitHub CLI subscription/session authentication is unavailable.') }
$codex = Invoke-QmNative -FilePath 'codex.exe' -Arguments @('doctor', '--summary', '--no-color') -WorkingDirectory (Get-QmRepositoryRoot) -TimeoutSeconds 90
if ($codex.ExitCode -ne 0) { $failures.Add('Codex doctor failed; inspect it interactively before live mode.') }
$claude = Invoke-QmNative -FilePath 'claude.exe' -Arguments @('auth', 'status') -TimeoutSeconds 30
if ($claude.ExitCode -ne 0) { $failures.Add('Claude subscription authentication is unavailable for the enabled provider.') }
$dotnetEf = Invoke-QmNative -FilePath 'dotnet.exe' -Arguments @('ef', '--version') -WorkingDirectory (Get-QmRepositoryRoot) -TimeoutSeconds 30
if ($dotnetEf.ExitCode -ne 0) { $failures.Add('dotnet-ef is required for destructive-migration rehearsal.') }

$modelResults = @()
if ($ValidateModels -and $failures.Count -eq 0) {
    foreach ($model in @('gpt-6.1-sol', 'gpt-6-luna')) {
        $result = Invoke-QmNative -FilePath 'codex.exe' -Arguments @('exec', '--ephemeral', '--model', $model, '--sandbox', 'read-only', '--cd', (Get-QmRepositoryRoot), 'Reply with exactly READY.') -WorkingDirectory (Get-QmRepositoryRoot) -TimeoutSeconds 180
        $modelResults += [pscustomobject]@{ provider = 'codex'; requested = $model; actual = $model; available = $result.ExitCode -eq 0 -and $result.StdOut -match 'READY' }
        if (-not $modelResults[-1].available) { $failures.Add("Configured subscription model is unavailable: $model") }
    }
    if ($config.Providers.claude.Enabled) {
        $claudeQuotaExhausted = $false
        foreach ($model in @('opus','sonnet','haiku')) {
            if ($claudeQuotaExhausted) {
                $modelResults += [pscustomobject]@{ provider = 'claude'; requested = $model; actual = $null; available = $false; status = 'deferred-after-quota' }
                continue
            }
            $result = Invoke-QmNative -FilePath 'claude.exe' -Arguments @('-p','--model',$model,'--effort','medium','--output-format','json','--no-session-persistence') -StandardInput 'Reply with exactly READY.' -WorkingDirectory (Get-QmRepositoryRoot) -TimeoutSeconds 180
            $envelope = $null
            if (-not [string]::IsNullOrWhiteSpace($result.StdOut)) { try { $envelope = $result.StdOut | ConvertFrom-Json } catch { } }
            $available = $null -ne $envelope -and $envelope.subtype -eq 'success' -and $envelope.result -match 'READY'
            $actual = if ($null -ne $envelope -and $envelope.PSObject.Properties.Name -contains 'model') { $envelope.model } else { $null }
            $quotaExhausted = $null -ne $envelope -and (Test-QmQuotaResult -Text ([string]$envelope.result))
            $modelResults += [pscustomobject]@{ provider = 'claude'; requested = $model; actual = $actual; available = $available; status = if ($quotaExhausted) { 'quota-exhausted' } elseif ($available) { 'available' } else { 'unavailable' } }
            if ($quotaExhausted) { $claudeQuotaExhausted = $true; $warnings.Add("Claude subscription quota is temporarily exhausted while validating: $model") }
            elseif (-not $available) { $failures.Add("Configured Claude subscription model is unavailable: $model") }
        }
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
