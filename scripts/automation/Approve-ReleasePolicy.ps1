[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$CandidateSha,
    [Parameter(Mandatory = $true)][ValidateSet('automation-policy', 'deployment-controls', 'destructive-migration')][string[]]$Scope
)
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
$directory = Join-Path $config.StateRoot 'approvals'
if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$path = Join-Path $directory "$CandidateSha.json"
Write-QmAtomicJson -Path $path -Value ([ordered]@{ candidateSha = $CandidateSha; scopes = @($Scope); approvedBy = [Environment]::UserName; approvedAt = (Get-QmUtcNow).ToString('o') })
Write-Output "Recorded manual approval bound to $CandidateSha at $path"
