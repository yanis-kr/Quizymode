[CmdletBinding()]
param([Parameter(Mandatory = $true)][int]$IssueNumber)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force

function Save-QmReleaseHalt {
    param($Config, $State, [string]$Reason)
    Write-QmAtomicJson -Path (Join-Path $Config.StateRoot 'release-halt.json') -Value ([ordered]@{
        issue = [int]$State.issue; mergeSha = $State.release.mergeSha; status = $State.release.status
        reason = $Reason; recordedAt = (Get-QmUtcNow).ToString('o')
    })
}

function Wait-QmWorkflowRun {
    param($Config, [string]$Workflow, [string]$Commit, [DateTime]$NotBefore, [int]$TimeoutMinutes)
    $deadline = (Get-QmUtcNow).AddMinutes($TimeoutMinutes)
    do {
        $runsResult = Invoke-QmGitHub -Arguments @('run','list','--repo',$Config.Repository,'--workflow',$Workflow,'--json','databaseId,status,conclusion,url,headSha,createdAt,event','--limit','20')
        if ($runsResult.ExitCode -eq 0) {
            $runs = @(ConvertFrom-QmCommandJson $runsResult "Read $Workflow runs")
            $run = @($runs | Where-Object {
                ($Commit -and $_.headSha -eq $Commit) -or
                (-not $Commit -and [DateTime]::Parse($_.createdAt).ToUniversalTime() -ge $NotBefore.ToUniversalTime())
            } | Sort-Object { [DateTime]::Parse($_.createdAt) } -Descending | Select-Object -First 1)
            if ($run.Count -gt 0 -and $run[0].status -eq 'completed') { return $run[0] }
        }
        Start-Sleep -Seconds 30
    } while ((Get-QmUtcNow) -lt $deadline)
    return $null
}

function Invoke-QmApplicationRollback {
    param($Config, $State, [string]$Reason)
    if ($State.release.status -eq 'rollback-pending' -and $null -ne $State.release.rollbackDispatchedAt) {
        $dispatchTime = [DateTime]::Parse($State.release.rollbackDispatchedAt).ToUniversalTime()
    }
    else {
        $State.release.status = 'rollback-pending'
        $State.release.outcomeRecordedAt = $null
        $State.release.diagnostics = @($Reason)
        $dispatchTime = Get-QmUtcNow
        $State.release | Add-Member -NotePropertyName rollbackDispatchedAt -NotePropertyValue $dispatchTime.ToString('o') -Force
        Save-QmCheckpoint -Config $Config -State $State
        $dispatch = Invoke-QmGitHub -Arguments @('workflow','run',$Config.RollbackWorkflowFile,'--repo',$Config.Repository,'--ref',$Config.BaseBranch,'-f',"previous_sha=$($State.release.previousMainSha)",'-f',"failed_sha=$($State.release.mergeSha)")
        if ($dispatch.ExitCode -ne 0) {
            $State.release.status = 'rollback-failed'
            $State.release.diagnostics = @($Reason, "Rollback dispatch failed: $($dispatch.StdErr)")
            $State.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
            $State.stage = 'rollback-failed'; $State.status = 'rollback-failed'
            Save-QmCheckpoint -Config $Config -State $State
            Save-QmReleaseHalt -Config $Config -State $State -Reason ($State.release.diagnostics -join ' ')
            throw $State.release.diagnostics[-1]
        }
    }
    $rollback = Wait-QmWorkflowRun -Config $Config -Workflow $Config.RollbackWorkflowFile -Commit $null -NotBefore $dispatchTime -TimeoutMinutes $Config.DeploymentTimeoutMinutes
    $State.release.rollbackUrl = if ($null -ne $rollback) { $rollback.url } else { $null }
    $State.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
    if ($null -ne $rollback -and $rollback.conclusion -eq 'success') {
        $attempt = 0
        if ($State.repairAttempts.PSObject.Properties.Name -contains 'deployment') { $attempt = [int]$State.repairAttempts.deployment }
        $attempt++
        $State.repairAttempts | Add-Member -NotePropertyName deployment -NotePropertyValue $attempt -Force
        $State.release.status = 'rolled-back'; $State.stage = 'implementation'; $State.status = 'repair'
        $State.evidence = $null; $State.evidencePublication = $null; $State.finalReviewSha = $null
        $State.nextAction = 'Application rollback succeeded. Coder must diagnose and repair the failed release before full revalidation.'
        if ($attempt -gt $Config.MaxRepairAttempts) {
            $State.stage = 'blocked'; $State.status = 'blocked'
            $State.nextAction = 'Deployment failed after the maximum automated repair attempts; releases remain halted.'
        }
    }
    else {
        $rollbackAttempt = 0
        if ($State.repairAttempts.PSObject.Properties.Name -contains 'rollback') { $rollbackAttempt = [int]$State.repairAttempts.rollback }
        $rollbackAttempt++
        $State.repairAttempts | Add-Member -NotePropertyName rollback -NotePropertyValue $rollbackAttempt -Force
        if ($rollbackAttempt -le $Config.MaxRepairAttempts) {
            $State.release.status = 'rollback-retry'; $State.stage = 'release-candidate'; $State.status = 'repair'
            $State.nextAction = "Retry application rollback attempt $($rollbackAttempt + 1)."
        }
        else {
            $State.release.status = 'rollback-failed'; $State.stage = 'rollback-failed'; $State.status = 'rollback-failed'
            $State.nextAction = 'Application rollback failed after the maximum automated attempts. Preserve diagnostics; automated releases remain halted.'
        }
    }
    Save-QmCheckpoint -Config $Config -State $State
    Save-QmReleaseHalt -Config $Config -State $State -Reason $State.nextAction
    throw $State.nextAction
}

$bootstrapConfig = Get-QmConfig
$trustedConfigPath = Join-Path $bootstrapConfig.StateRoot 'trusted-policy\automation.config.psd1'
if (-not (Test-Path -LiteralPath $trustedConfigPath)) { throw 'Trusted release policy is not installed. Run Setup-Automation.ps1 from main.' }
$config = Get-QmConfig -Path $trustedConfigPath
$state = Read-QmJson -Path (Get-QmIssueStatePath -Config $config -Issue $IssueNumber)
$releaseStatus = if ($null -ne $state -and $null -ne $state.release) { [string]$state.release.status } else { $null }
if ($null -eq $state -or ($state.stage -ne 'release-candidate' -and $releaseStatus -notin @('merge-pending','deployment-pending','rollback-pending','rollback-retry','finalizing'))) { throw "Issue #$IssueNumber is not a release candidate or resumable release." }
if ($state.PSObject.Properties.Name -notcontains 'evidencePublication') { $state | Add-Member -NotePropertyName evidencePublication -NotePropertyValue $null }
$releaseLock = $null
try {
    $releaseLock = Enter-QmLock -Path (Join-Path $config.StateRoot 'locks\release.lock') -StaleAfterMinutes $config.LockStaleAfterMinutes
    $resumeAction = Get-QmReleaseResumeAction -ReleaseStatus $(if ($null -ne $state.release) { $state.release.status } else { $null })

    if ($resumeAction -eq 'observe-rollback') {
        Invoke-QmApplicationRollback -Config $config -State $state -Reason ($state.release.diagnostics -join ' ')
    }
    if ($resumeAction -eq 'retry-rollback') {
        Invoke-QmApplicationRollback -Config $config -State $state -Reason ($state.release.diagnostics -join ' ')
    }

    if ($resumeAction -eq 'finalize-issue') {
        $close = Invoke-QmGitHub -Arguments @('issue','close',$IssueNumber.ToString(),'--repo',$config.Repository,'--comment',"Released in $($state.release.mergeSha). Deployment: $($state.release.deploymentUrl)")
        if ($close.ExitCode -ne 0 -and $close.StdErr -notmatch '(?i)already closed') { throw "Close issue failed: $($close.StdErr)" }
        $state.release.status = 'released'; $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
        $state.stage = 'released'; $state.status = 'released'; $state.nextAction = 'Save handover and start a fresh issue session.'
        Save-QmCheckpoint -Config $config -State $state
        Write-Output "Released issue #$IssueNumber at merge SHA $($state.release.mergeSha)."
        exit 0
    }

    if ($resumeAction -eq 'reconcile-merge') {
        $mergedPr = ConvertFrom-QmCommandJson (Invoke-QmGitHub -Arguments @('pr','view',$state.pr.ToString(),'--repo',$config.Repository,'--json','mergeCommit,mergedAt,url')) "Reconcile merged PR #$($state.pr)"
        if ($null -eq $mergedPr.mergedAt) {
            $mergeResult = Invoke-QmGitHub -Arguments @('pr','merge',$state.pr.ToString(),'--repo',$config.Repository,'--merge','--match-head-commit',$state.release.candidateSha)
            if ($mergeResult.ExitCode -ne 0) { throw "GitHub merge failed during reconciliation: $($mergeResult.StdErr)" }
            $mergedPr = ConvertFrom-QmCommandJson (Invoke-QmGitHub -Arguments @('pr','view',$state.pr.ToString(),'--repo',$config.Repository,'--json','mergeCommit,mergedAt,url')) "Read merged PR #$($state.pr)"
        }
        $state.release.status='deployment-pending'; $state.release.mergeSha=$mergedPr.mergeCommit.oid
        Save-QmCheckpoint -Config $config -State $state
    }

    if ($null -eq $state.release -or $state.release.status -notin @('deployment-pending')) {
        if ($null -eq $state.release -or $state.release.status -notin @('waiting-checks','database-safety-passed')) {
            $state.release = [ordered]@{ status = 'validating'; startedAt = (Get-QmUtcNow).ToString('o'); outcomeRecordedAt = $null; previousMainSha = $null; mergeSha = $null; deploymentUrl = $null; rollbackUrl = $null; diagnostics = @(); databaseSafety = $null }
        }
        else {
            $state.release.status = 'validating'; $state.release.outcomeRecordedAt = $null; $state.release.diagnostics = @()
        }
        Save-QmCheckpoint -Config $config -State $state
        $fetch = Invoke-QmGit -Arguments @('fetch','origin','--prune') -WorkingDirectory $state.worktree -TimeoutSeconds 600
        if ($fetch.ExitCode -ne 0) { throw "Refresh main failed: $($fetch.StdErr)" }
        $currentBaseSha = Get-QmHeadSha -WorkingDirectory $state.worktree -Revision 'origin/main'
        if ($state.baseSha -ne $currentBaseSha) {
            $merge = Invoke-QmGit -Arguments @('merge','--no-edit','origin/main') -WorkingDirectory $state.worktree -TimeoutSeconds 600
            if ($merge.ExitCode -ne 0) {
                $state.release.status = 'integration-conflict'; $state.release.diagnostics = @($merge.StdOut,$merge.StdErr)
                $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o'); $state.status = 'repair'; $state.stage = 'implementation'
                $state.nextAction = 'Owning coder must resolve the preserved integration conflict, then republish and revalidate.'
                Save-QmCheckpoint -Config $config -State $state
                throw 'Integration conflict preserved for the owning provider.'
            }
            $state.baseSha = $currentBaseSha; $state.headSha = Get-QmHeadSha -WorkingDirectory $state.worktree
            $push = Invoke-QmGit -Arguments @('push','origin',$state.branch) -WorkingDirectory $state.worktree -TimeoutSeconds 600
            if ($push.ExitCode -ne 0) { throw "Push integrated candidate failed: $($push.StdErr)" }
            $state.evidence = $null; $state.evidencePublication = $null; $state.finalReviewSha = $null
            $state.stage = 'implementation'; $state.status = 'revalidation-required'
            $state.nextAction = 'Main advanced. Coder must regenerate applicable outputs and reconcile the integrated tree before retesting and review.'
            $state.release.status = 'revalidation-required'; $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
            Save-QmCheckpoint -Config $config -State $state
            exit 2
        }

        $pr = ConvertFrom-QmCommandJson (Invoke-QmGitHub -Arguments @('pr','view',$state.pr.ToString(),'--repo',$config.Repository,'--json','number,headRefOid,baseRefOid,isDraft,mergeStateStatus,statusCheckRollup,url')) "Read PR #$($state.pr)"
        $candidateSha = Get-QmHeadSha -WorkingDirectory $state.worktree
        if ($pr.headRefOid -ne $candidateSha) { throw 'Local candidate and remote PR head differ.' }
        if ($pr.isDraft) { throw 'Candidate PR is still draft; evidence publication must mark it ready before release.' }
        if ($null -eq $state.evidence -or $null -eq $state.evidencePublication) { throw 'Published acceptance evidence is missing.' }
        $manifest = Read-QmJson -Path $state.evidence
        $evidence = Test-QmEvidence -Manifest $manifest -CandidateHeadSha $candidateSha -CurrentBaseSha $currentBaseSha -RequirePass -ExpectedIssue ([int]$state.issue) -ExpectedPr ([int]$state.pr)
        $expectedHash = Get-QmEvidenceHash -Body (ConvertTo-QmJson $manifest)
        if ($state.evidencePublication.headSha -ne $candidateSha -or $state.evidencePublication.manifestHash -ne $expectedHash -or [string]::IsNullOrWhiteSpace($state.evidencePublication.issueUrl) -or [string]::IsNullOrWhiteSpace($state.evidencePublication.prUrl)) {
            $evidence = [pscustomobject]@{ Valid = $false; Errors = @($evidence.Errors + 'Acceptance evidence publication is missing or stale.') }
        }

        $changed = Invoke-QmGit -Arguments @('diff','--name-only',"origin/main...$candidateSha") -WorkingDirectory $state.worktree
        if ($changed.ExitCode -ne 0) { throw "Inspect protected changes failed: $($changed.StdErr)" }
        $changedPaths = @($changed.StdOut -split "`r?`n" | Where-Object { $_ })
        $migrationContents = @()
        foreach ($path in $changedPaths | Where-Object { $_ -match '(?i)(migration|\.sql$)' }) {
            $fullPath = Join-Path $state.worktree $path
            if (Test-Path -LiteralPath $fullPath) { $migrationContents += Get-Content -LiteralPath $fullPath -Raw }
        }
        $protectedScopes = @(Get-QmProtectedScopes -ChangedPaths $changedPaths -MigrationContents $migrationContents -Config $config)

        $checks = @($pr.statusCheckRollup | Where-Object { $null -ne $_.name } | ForEach-Object { [pscustomobject]@{ name=$_.name; status=$_.status; conclusion=$_.conclusion; sha=$candidateSha } })
        $pendingChecks = @(); $failedChecks = @()
        foreach ($required in $config.RequiredChecks) {
            $matching = @($checks | Where-Object { $_.name -eq $required })
            if ($matching.Count -eq 0 -or $matching[0].status -ne 'COMPLETED') { $pendingChecks += $required }
            elseif ($matching[0].conclusion -ne 'SUCCESS') { $failedChecks += $required }
        }
        if ($pendingChecks.Count -gt 0) {
            $state.release.status='waiting-checks'; $state.release.diagnostics=@("Waiting for required checks: $($pendingChecks -join ', ')")
            Save-QmCheckpoint -Config $config -State $state
            exit 0
        }
        if ($failedChecks.Count -gt 0) {
            $attempt=0
            if ($state.repairAttempts.PSObject.Properties.Name -contains 'release-checks') { $attempt=[int]$state.repairAttempts.'release-checks' }
            $attempt++
            $state.repairAttempts | Add-Member -NotePropertyName 'release-checks' -NotePropertyValue $attempt -Force
            $state.release.status='checks-failed'; $state.release.diagnostics=@("Failed required checks: $($failedChecks -join ', ')")
            if ($attempt -gt $config.MaxRepairAttempts) { $state.stage='blocked'; $state.status='blocked' }
            else { $state.stage='implementation'; $state.status='repair'; $state.nextAction='Coder must repair the failed required checks.' }
            Save-QmCheckpoint -Config $config -State $state
            exit 2
        }
        if ($protectedScopes -contains 'destructive-migration') {
            $safety = $state.release.databaseSafety
            if ($null -eq $safety -or $safety.candidateSha -ne $candidateSha -or $safety.status -ne 'pass') {
                $safety = & (Join-Path $PSScriptRoot 'Invoke-DatabaseSafety.ps1') -CandidateSha $candidateSha -Worktree $state.worktree -ConfigPath $trustedConfigPath | ConvertFrom-Json
            }
            if ($safety.status -ne 'pass' -or -not $safety.rehearsal.restored -or -not $safety.rehearsal.migrationsApplied) { throw 'Destructive migration safety rehearsal did not pass.' }
            $state.release.databaseSafety = $safety; $state.release.status = 'database-safety-passed'
            Save-QmCheckpoint -Config $config -State $state
        }
        $gate = Test-QmReleaseGate -CandidateSha $candidateSha -VerifiedSha $manifest.headSha -BaseSha $currentBaseSha -VerifiedBaseSha $manifest.baseSha -Checks $checks -RequiredChecks $config.RequiredChecks -IndependentReviewPassed ($state.finalReviewSha -eq $candidateSha) -EvidencePassed $evidence.Valid -ReleaseEnabled $config.ReleaseEnabled
        if (-not $gate.Allowed) {
            $state.release.status='blocked'; $state.release.diagnostics=@($gate.Reasons + $evidence.Errors); $state.release.outcomeRecordedAt=(Get-QmUtcNow).ToString('o')
            Save-QmCheckpoint -Config $config -State $state
            throw ("Release blocked:`n" + ($state.release.diagnostics -join "`n"))
        }

        $finalFetch = Invoke-QmGit -Arguments @('fetch','origin') -WorkingDirectory $state.worktree
        if ($finalFetch.ExitCode -ne 0 -or (Get-QmHeadSha -WorkingDirectory $state.worktree -Revision 'origin/main') -ne $currentBaseSha) { throw 'Main advanced after validation; re-enter integration and revalidation.' }
        $state.release.previousMainSha = $currentBaseSha
        $state.release | Add-Member -NotePropertyName candidateSha -NotePropertyValue $candidateSha -Force
        $state.release.status = 'merge-pending'
        Save-QmCheckpoint -Config $config -State $state
        $mergeResult = Invoke-QmGitHub -Arguments @('pr','merge',$state.pr.ToString(),'--repo',$config.Repository,'--merge','--match-head-commit',$candidateSha)
        if ($mergeResult.ExitCode -ne 0) { throw "GitHub merge failed: $($mergeResult.StdErr)" }
        $mergedPr = ConvertFrom-QmCommandJson (Invoke-QmGitHub -Arguments @('pr','view',$state.pr.ToString(),'--repo',$config.Repository,'--json','mergeCommit,mergedAt,url')) "Read merged PR #$($state.pr)"
        $state.release.status='deployment-pending'; $state.release.mergeSha=$mergedPr.mergeCommit.oid
        Save-QmCheckpoint -Config $config -State $state
    }

    $deployment = Wait-QmWorkflowRun -Config $config -Workflow $config.DeploymentWorkflowFile -Commit $state.release.mergeSha -NotBefore ([DateTime]::Parse($state.release.startedAt)) -TimeoutMinutes $config.DeploymentTimeoutMinutes
    if ($null -eq $deployment -or $deployment.conclusion -ne 'success') { Invoke-QmApplicationRollback -Config $config -State $state -Reason 'Deployment failed, timed out, or did not correlate to the merge SHA.' }
    $state.release.deploymentUrl = $deployment.url
    Save-QmCheckpoint -Config $config -State $state
    foreach ($url in @($config.SmokeUrls)) {
        try {
            $response=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
            if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { throw "HTTP $($response.StatusCode)" }
        }
        catch { Invoke-QmApplicationRollback -Config $config -State $state -Reason "Smoke check failed: $url - $($_.Exception.Message)" }
    }
    $state.release.status='finalizing'; $state.nextAction='Close the issue and record the terminal release checkpoint.'
    Save-QmCheckpoint -Config $config -State $state
    $close = Invoke-QmGitHub -Arguments @('issue','close',$IssueNumber.ToString(),'--repo',$config.Repository,'--comment',"Released in $($state.release.mergeSha). Deployment: $($state.release.deploymentUrl)")
    if ($close.ExitCode -ne 0 -and $close.StdErr -notmatch '(?i)already closed') { throw "Close issue failed: $($close.StdErr)" }
    $state.release.status='released'; $state.release.outcomeRecordedAt=(Get-QmUtcNow).ToString('o'); $state.stage='released'; $state.status='released'; $state.nextAction='Save handover and start a fresh issue session.'
    Save-QmCheckpoint -Config $config -State $state
    Write-Output "Released issue #$IssueNumber at merge SHA $($state.release.mergeSha)."
}
catch {
    if ($null -ne $state -and $null -ne $state.release -and $null -eq $state.release.outcomeRecordedAt -and $state.release.status -notin @('merge-pending','deployment-pending','rollback-pending','rollback-retry','finalizing','waiting-checks')) {
        $state.release.status='release-error'; $state.release.diagnostics=@($_.Exception.Message); $state.release.outcomeRecordedAt=(Get-QmUtcNow).ToString('o')
        Save-QmCheckpoint -Config $config -State $state
    }
    throw
}
finally { if ($null -ne $releaseLock) { Exit-QmLock -Lock $releaseLock } }
