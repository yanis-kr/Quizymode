[CmdletBinding()]
param([switch]$InstallScheduledTask)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
Initialize-QmDirectories -Config $config

& (Join-Path $PSScriptRoot 'Test-Preflight.ps1')

$branch = (Invoke-QmGit -Arguments @('branch', '--show-current') -WorkingDirectory (Get-QmRepositoryRoot)).StdOut.Trim()
if ($branch -eq $config.BaseBranch) {
    $trustedPath = Install-QmTrustedPolicy -Config $config -SourceConfigPath (Join-Path $PSScriptRoot 'automation.config.psd1')
    Write-Output "Installed trusted release policy from main at $trustedPath"
}
else {
    Write-Warning 'Trusted release policy was not installed because setup is not running from main. Install it only after the bootstrap PR is reviewed and merged.'
}

if ($InstallScheduledTask) { & (Join-Path $PSScriptRoot 'Install-ScheduledTask.ps1') }
Write-Output 'Setup complete. The scheduled task runs unattended when installed; Invoke-DryRun.ps1 remains available for harmless validation.'
