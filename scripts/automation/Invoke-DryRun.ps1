[CmdletBinding()]
param(
    [ValidateSet('codex', 'claude')][string]$Provider = 'codex',
    [Nullable[int]]$IssueNumber
)
& (Join-Path $PSScriptRoot 'Invoke-Controller.ps1') -Provider $Provider -IssueNumber $IssueNumber
if (-not $?) { exit 1 }
