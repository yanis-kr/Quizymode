[CmdletBinding()]
param(
    [ValidateSet('all', 'codex', 'claude')][string]$Provider = 'all',
    [switch]$Once,
    [switch]$Live
)
$config = Import-PowerShellDataFile (Join-Path $PSScriptRoot 'automation.config.psd1')
do {
    if ($Live) { & (Join-Path $PSScriptRoot 'Invoke-AutomationCycle.ps1') -Provider $Provider }
    else {
        $dryRunProvider = if ($Provider -eq 'all') { 'codex' } else { $Provider }
        & (Join-Path $PSScriptRoot 'Invoke-Controller.ps1') -Provider $dryRunProvider
    }
    if ($Once) { break }
    Start-Sleep -Seconds $config.ControllerPollSeconds
} while ($Live)
if (-not $?) { exit 1 }
