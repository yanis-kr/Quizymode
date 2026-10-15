[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][int]$IssueNumber,
    [switch]$ApproveRelease
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force

$bootstrapConfig = Get-QmConfig
$trustedConfigPath = Join-Path $bootstrapConfig.StateRoot 'trusted-policy\automation.config.psd1'
if (-not (Test-Path -LiteralPath $trustedConfigPath)) { throw 'Trusted release policy is not installed. Run Setup-Automation.ps1 from reviewed main after merge.' }
$config = Get-QmConfig -Path $trustedConfigPath
$state = Read-QmJson -Path (Get-QmIssueStatePath -Config $config -Issue $IssueNumber)
if ($null -eq $state -or $state.stage -ne 'release-candidate') { throw "Issue #$IssueNumber is not a release candidate." }
$releaseLock = $null
try {
    $releaseLock = Enter-QmLock -Path (Join-Path $config.StateRoot 'locks\release.lock') -StaleAfterMinutes $config.LockStaleAfterMinutes
    $state.release = [ordered]@{ status = 'validating'; startedAt = (Get-QmUtcNow).ToString('o'); outcomeRecordedAt = $null; mergeSha = $null; deploymentUrl = $null; diagnostics = @() }
    Save-QmCheckpoint -Config $config -State $state

    $fetch = Invoke-QmGit -Arguments @('fetch', 'origin', '--prune') -WorkingDirectory $state.worktree -TimeoutSeconds 600
    if ($fetch.ExitCode -ne 0) { throw "Refresh main failed: $($fetch.StdErr)" }
    $currentBaseSha = Get-QmHeadSha -WorkingDirectory $state.worktree -Revision 'origin/main'
    if ($state.baseSha -ne $currentBaseSha) {
        $merge = Invoke-QmGit -Arguments @('merge', '--no-edit', 'origin/main') -WorkingDirectory $state.worktree -TimeoutSeconds 600
        if ($merge.ExitCode -ne 0) {
            $state.release.status = 'integration-conflict'
            $state.release.diagnostics = @($merge.StdOut, $merge.StdErr)
            $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
            $state.status = 'blocked'
            $state.nextAction = 'Owning provider must resolve the preserved worktree conflict; then regenerate, test, review, and publish fresh evidence.'
            Save-QmCheckpoint -Config $config -State $state
            throw 'Integration conflict preserved for the owning provider.'
        }
        $state.baseSha = $currentBaseSha
        $state.headSha = Get-QmHeadSha -WorkingDirectory $state.worktree
        $state.evidence = $null
        $state.finalReviewSha = $null
        $state.stage = 'testing'
        $state.status = 'revalidation-required'
        $state.nextAction = 'Main advanced. Regenerate generated outputs as applicable, rerun tests, independent review, and evidence on the integrated SHA.'
        $state.release.status = 'revalidation-required'
        $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
        Save-QmCheckpoint -Config $config -State $state
        Write-Output "Integrated current origin/main into candidate $($state.headSha); release stopped for fresh validation."
        exit 2
    }

    $prResult = Invoke-QmGitHub -Arguments @('pr', 'view', $state.pr.ToString(), '--repo', $config.Repository, '--json', 'number,headRefOid,baseRefOid,isDraft,mergeStateStatus,statusCheckRollup,url')
    $pr = ConvertFrom-QmCommandJson $prResult "Read PR #$($state.pr)"
    $candidateSha = Get-QmHeadSha -WorkingDirectory $state.worktree
    if ($pr.headRefOid -ne $candidateSha) { throw 'Local candidate and remote PR head differ.' }
    if ($null -eq $state.evidence) { throw 'Acceptance evidence is missing.' }
    $manifest = Read-QmJson -Path $state.evidence
    $evidence = Test-QmEvidence -Manifest $manifest -CandidateHeadSha $candidateSha -CurrentBaseSha $currentBaseSha -RequirePass

    $changed = Invoke-QmGit -Arguments @('diff', '--name-only', "origin/main...$candidateSha") -WorkingDirectory $state.worktree
    if ($changed.ExitCode -ne 0) { throw "Inspect protected changes failed: $($changed.StdErr)" }
    $changedPaths = @($changed.StdOut -split "`r?`n" | Where-Object { $_ })
    $migrationContents = @()
    foreach ($path in $changedPaths | Where-Object { $_ -match '(?i)(migration|\.sql$)' }) {
        $fullPath = Join-Path $state.worktree $path
        if (Test-Path -LiteralPath $fullPath) { $migrationContents += (Get-Content -LiteralPath $fullPath -Raw) }
    }
    $protectedScopes = @(Get-QmProtectedScopes -ChangedPaths $changedPaths -MigrationContents $migrationContents -Config $config)
    $approvalPassed = $protectedScopes.Count -eq 0
    if (-not $approvalPassed -and $ApproveRelease) {
        $approvalPath = Join-Path $config.StateRoot "approvals\$candidateSha.json"
        $approvalPassed = (Test-QmManualApproval -ApprovalPath $approvalPath -CandidateSha $candidateSha -RequiredScopes $protectedScopes).Valid
    }

    $checks = @()
    foreach ($item in @($pr.statusCheckRollup)) {
        if ($null -ne $item.name) { $checks += [pscustomobject]@{ name = $item.name; status = $item.status; conclusion = $item.conclusion; sha = $candidateSha } }
    }
    $gate = Test-QmReleaseGate -CandidateSha $candidateSha -VerifiedSha $manifest.headSha -BaseSha $currentBaseSha -VerifiedBaseSha $manifest.baseSha -Checks $checks -RequiredChecks $config.RequiredChecks -IndependentReviewPassed ($state.finalReviewSha -eq $candidateSha) -EvidencePassed $evidence.Valid -ReleaseEnabled $config.ReleaseEnabled -PolicyApprovalPassed $approvalPassed
    if (-not $gate.Allowed) {
        $state.release.status = 'blocked'
        $state.release.diagnostics = @($gate.Reasons + $evidence.Errors)
        $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
        Save-QmCheckpoint -Config $config -State $state
        $releaseErrors = $state.release.diagnostics -join [Environment]::NewLine
        throw ("Release blocked:" + [Environment]::NewLine + $releaseErrors)
    }

    $finalFetch = Invoke-QmGit -Arguments @('fetch', 'origin') -WorkingDirectory $state.worktree
    if ($finalFetch.ExitCode -ne 0 -or (Get-QmHeadSha -WorkingDirectory $state.worktree -Revision 'origin/main') -ne $currentBaseSha) { throw 'Main advanced after validation; re-enter integration and revalidation.' }
    $mergeResult = Invoke-QmGitHub -Arguments @('pr', 'merge', $state.pr.ToString(), '--repo', $config.Repository, '--merge', '--match-head-commit', $candidateSha)
    if ($mergeResult.ExitCode -ne 0) { throw "GitHub merge failed: $($mergeResult.StdErr)" }

    $mergedPr = ConvertFrom-QmCommandJson (Invoke-QmGitHub -Arguments @('pr', 'view', $state.pr.ToString(), '--repo', $config.Repository, '--json', 'mergeCommit,mergedAt,url')) "Read merged PR #$($state.pr)"
    $mergeSha = $mergedPr.mergeCommit.oid
    $state.release.status = 'deployment-pending'
    $state.release.mergeSha = $mergeSha
    Save-QmCheckpoint -Config $config -State $state

    $deadline = (Get-QmUtcNow).AddMinutes(90)
    $deployment = $null
    do {
        $runsResult = Invoke-QmGitHub -Arguments @('run', 'list', '--repo', $config.Repository, '--workflow', 'deploy.yml', '--commit', $mergeSha, '--json', 'databaseId,status,conclusion,url,headSha', '--limit', '5')
        if ($runsResult.ExitCode -eq 0) { $deployment = @(ConvertFrom-QmCommandJson $runsResult 'Read deployment run' | Where-Object { $_.headSha -eq $mergeSha } | Select-Object -First 1) }
        if ($deployment.Count -gt 0 -and $deployment[0].status -eq 'completed') { break }
        Start-Sleep -Seconds 30
    } while ((Get-QmUtcNow) -lt $deadline)

    if ($deployment.Count -eq 0 -or $deployment[0].status -ne 'completed' -or $deployment[0].conclusion -ne 'success') {
        $state.release.status = 'deployment-failed'
        $state.release.deploymentUrl = if ($deployment.Count -gt 0) { $deployment[0].url } else { $null }
        $state.release.diagnostics = @('Deployment failed, timed out, or did not correlate to the merge SHA. Issue remains open; releases stop.')
        $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
        Save-QmCheckpoint -Config $config -State $state
        throw $state.release.diagnostics[0]
    }

    foreach ($url in @($config.SmokeUrls)) {
        try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30; if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { throw "HTTP $($response.StatusCode)" } }
        catch {
            $state.release.status = 'deployment-failed'
            $state.release.diagnostics = @("Smoke check failed: $url - $($_.Exception.Message)")
            $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
            Save-QmCheckpoint -Config $config -State $state
            throw $state.release.diagnostics[0]
        }
    }

    $state.release.status = 'released'
    $state.release.deploymentUrl = $deployment[0].url
    $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
    $state.stage = 'released'
    $state.status = 'released'
    $state.nextAction = 'Save handover and start a fresh issue session. Cleanup only after confirming the worktree is clean and merged.'
    Save-QmCheckpoint -Config $config -State $state
    [void](Invoke-QmGitHub -Arguments @('issue', 'close', $IssueNumber.ToString(), '--repo', $config.Repository, '--comment', "Released in $mergeSha. Deployment: $($deployment[0].url)"))
    Write-Output "Released issue #$IssueNumber at merge SHA $mergeSha."
}
catch {
    if ($null -ne $state -and $null -ne $state.release -and $null -eq $state.release.outcomeRecordedAt) {
        $state.release.status = 'release-error'
        $state.release.diagnostics = @($_.Exception.Message)
        $state.release.outcomeRecordedAt = (Get-QmUtcNow).ToString('o')
        Save-QmCheckpoint -Config $config -State $state
    }
    throw
}
finally {
    if ($null -ne $releaseLock) { Exit-QmLock -Lock $releaseLock }
}
