[CmdletBinding()]
param(
    [ValidateSet('codex', 'claude')][string]$Provider = 'codex',
    [switch]$Once,
    [switch]$Live
)
$config = Import-PowerShellDataFile (Join-Path $PSScriptRoot 'automation.config.psd1')
do {
    & (Join-Path $PSScriptRoot 'Invoke-Controller.ps1') -Provider $Provider -Live:$Live
    if ($Once -or -not $Live) { break }
    Start-Sleep -Seconds $config.ControllerPollSeconds
} while ($true)
if (-not $?) { exit 1 }
