[CmdletBinding()]
param()
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
$paused = Test-Path -LiteralPath (Join-Path $config.StateRoot 'paused.json')
$states = @()
if (Test-Path -LiteralPath (Join-Path $config.StateRoot 'issues')) {
    $states = @(Get-ChildItem -LiteralPath (Join-Path $config.StateRoot 'issues') -Filter '*.json' | ForEach-Object { Read-QmJson -Path $_.FullName })
}
[pscustomobject]@{ paused = $paused; dryRunDefault = $config.DryRunByDefault; releaseEnabled = $config.ReleaseEnabled; stateRoot = $config.StateRoot; issues = $states } | ConvertTo-Json -Depth 20
