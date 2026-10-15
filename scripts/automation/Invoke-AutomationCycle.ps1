[CmdletBinding()]
param([ValidateSet('all','codex','claude')][string]$Provider = 'all')
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
$powerShellPath = (Get-Command powershell.exe).Source
$paused = Test-Path -LiteralPath (Join-Path $config.StateRoot 'paused.json')
$haltPath = Join-Path $config.StateRoot 'release-halt.json'
$halted = Test-Path -LiteralPath $haltPath

if (-not $paused) {
    $providers = if ($Provider -eq 'all') { @($config.Providers.Keys | Where-Object { $config.Providers[$_].Enabled }) } else { @($Provider) }
    foreach ($name in $providers) {
        $result = Invoke-QmNative -FilePath $powerShellPath -Arguments @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Invoke-Controller.ps1'),'-Provider',$name,'-Live') -WorkingDirectory (Get-QmRepositoryRoot) -TimeoutSeconds ($config.StageTimeoutMinutes * 60 + 300)
        if ($result.ExitCode -ne 0) { Write-Warning "Provider cycle failed for $name; durable state was preserved: $($result.StdErr)" }
    }
}

$issueDirectory = Join-Path $config.StateRoot 'issues'
if (Test-Path -LiteralPath $issueDirectory) {
    $states = @(Get-ChildItem -LiteralPath $issueDirectory -Filter '*.json' | ForEach-Object { Read-QmJson -Path $_.FullName })
    if ($halted) {
        $halt = Read-QmJson -Path $haltPath
        $repaired = @($states | Where-Object { [int]$_.issue -eq [int]$halt.issue -and $_.stage -eq 'release-candidate' -and $_.headSha -ne $_.release.candidateSha })
        if ($repaired.Count -gt 0) {
            Remove-Item -LiteralPath $haltPath -Force
            $halted = $false
            Write-Output "Release halt cleared after issue #$($halt.issue) produced a newly verified candidate."
        }
    }
    foreach ($state in $states) {
        $inFlight = $null -ne $state.release -and $state.release.status -in @('merge-pending','deployment-pending','rollback-pending','rollback-retry','finalizing')
        $newCandidate = $state.stage -eq 'release-candidate' -and -not $halted -and -not $paused
        if ($inFlight -or $newCandidate) {
            $result = Invoke-QmNative -FilePath $powerShellPath -Arguments @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Invoke-Release.ps1'),'-IssueNumber',$state.issue.ToString()) -WorkingDirectory (Get-QmRepositoryRoot) -TimeoutSeconds (($config.DeploymentTimeoutMinutes * 2 + 30) * 60)
            if ($result.ExitCode -ne 0) { Write-Warning "Release cycle failed for issue #$($state.issue); durable state was preserved: $($result.StdErr)" }
        }
    }
}

if ($paused) { Write-Output 'Automation is paused; only in-flight release work was reconciled.' }
if ($halted) { Write-Output 'New releases are halted after a failed deployment or rollback; issue work may continue.' }
