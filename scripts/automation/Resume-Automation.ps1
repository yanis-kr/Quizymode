[CmdletBinding()]
param()
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
$pausePath = Join-Path $config.StateRoot 'paused.json'
if (Test-Path -LiteralPath $pausePath) { Remove-Item -LiteralPath $pausePath -Force }
Write-Output 'Resumed. The next controller run will reconcile checkpoints before taking new side effects.'
