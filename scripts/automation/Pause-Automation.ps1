[CmdletBinding()]
param([string]$Reason = 'Paused by operator')
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
Initialize-QmDirectories -Config $config
Write-QmAtomicJson -Path (Join-Path $config.StateRoot 'paused.json') -Value ([ordered]@{ pausedAt = (Get-QmUtcNow).ToString('o'); reason = $Reason; requestedBy = [Environment]::UserName })
Write-Output 'Paused. No new issues or stages will start; an active deployment must still reach a recorded outcome.'
