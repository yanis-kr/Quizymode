[CmdletBinding()]
param(
    [string]$TaskName = 'Quizymode Automation Controller',
    [ValidateRange(5, 1440)][int]$IntervalMinutes = 15
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$branch = (& git.exe -C $repositoryRoot branch --show-current).Trim()
if ($branch -ne 'main') { throw "Install the scheduled task only from the main checkout; current branch is '$branch'." }
$scriptPath = (Resolve-Path (Join-Path $PSScriptRoot 'Start-Automation.ps1')).Path
$powerShellPath = (Get-Command powershell.exe).Source
    $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`" -Provider all -Once -Live"
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $repositoryRoot
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Autonomous Quizymode development and release controller. Durable file locks prevent overlapping side effects.'
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Write-Output "Installed scheduled task '$TaskName' for the current interactive user in autonomous live mode."
