[CmdletBinding()]
param(
    [ValidateSet('codex', 'claude')][string]$Provider = 'codex',
    [Nullable[int]]$IssueNumber,
    [switch]$Live,
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'automation.config.psd1')
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force

$config = Get-QmConfig -Path $ConfigPath
Initialize-QmDirectories -Config $config
$dryRun = -not $Live.IsPresent
$lock = $null
try {
    $lock = Enter-QmLock -Path (Join-Path $config.StateRoot 'locks\controller.lock') -StaleAfterMinutes $config.LockStaleAfterMinutes
    if (Test-Path -LiteralPath (Join-Path $config.StateRoot 'paused.json')) {
        Write-Output 'Quizymode automation is paused; no new work was started.'
        exit 0
    }
    if (-not $config.Providers.ContainsKey($Provider)) { throw "Unknown provider: $Provider" }
    if (-not $config.Providers[$Provider].Enabled -and -not $dryRun) { throw "Provider is disabled: $Provider" }

    $repositoryRoot = Get-QmRepositoryRoot
    $fetch = Invoke-QmGit -Arguments @('fetch', 'origin', '--prune') -WorkingDirectory $repositoryRoot
    if ($fetch.ExitCode -ne 0) { throw "Refresh origin failed: $($fetch.StdErr)" }
    $baseSha = Get-QmHeadSha -WorkingDirectory $repositoryRoot -Revision 'origin/main'

    $activeStates = @()
    $issueStateDirectory = Join-Path $config.StateRoot 'issues'
    if (Test-Path -LiteralPath $issueStateDirectory) {
        $activeStates = @(Get-ChildItem -LiteralPath $issueStateDirectory -Filter '*.json' | ForEach-Object { Read-QmJson -Path $_.FullName } | Where-Object { $_.provider -eq $Provider -and $_.status -notin @('released', 'blocked', 'dry-run-complete', 'rollback-failed') })
    }
    if ($activeStates.Count -gt 1) { throw "Provider $Provider has multiple active checkpoints; reconcile shared state before continuing." }
    if ($activeStates.Count -eq 1) {
        if ($null -ne $IssueNumber -and [int]$IssueNumber -ne [int]$activeStates[0].issue) { throw "Provider $Provider must resume issue #$($activeStates[0].issue) before selecting #$IssueNumber." }
        $IssueNumber = [int]$activeStates[0].issue
    }
    $issue = Select-QmIssue -Config $config -Provider $Provider -RequestedIssue $IssueNumber
    if ($null -eq $issue) {
        Write-Output "No ready, unowned issue is available for $Provider."
        exit 0
    }
    $dependencyStatus = Test-QmDependencies -Issue $issue -Repository $config.Repository
    if (-not $dependencyStatus.Ready) {
        Write-Output "Issue #$($issue.number) is blocked by: $($dependencyStatus.Blockers -join ', ')"
        exit 0
    }

    $providerConfig = $config.Providers[$Provider]
    $branch = "$($providerConfig.BranchPrefix)/$($issue.number)-automation"
    if ($dryRun) {
        $evidence = New-QmDryRunEvidence -Issue ([int]$issue.number) -HeadSha $baseSha -BaseSha $baseSha
        $validation = Test-QmEvidence -Manifest $evidence -CandidateHeadSha $baseSha -CurrentBaseSha $baseSha
        if (-not $validation.Valid) { throw "Dry-run evidence failed completeness validation: $($validation.Errors -join '; ')" }
        $artifactDirectory = Join-Path $config.ArtifactRoot "dry-run\issue-$($issue.number)"
        if (-not (Test-Path -LiteralPath $artifactDirectory)) { New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null }
        $evidencePath = Join-Path $artifactDirectory 'evidence.json'
        Write-QmAtomicJson -Path $evidencePath -Value $evidence
        $dryRunDirectory = Join-Path $config.StateRoot 'dry-runs'
        if (-not (Test-Path -LiteralPath $dryRunDirectory)) { New-Item -ItemType Directory -Path $dryRunDirectory -Force | Out-Null }
        Write-QmAtomicJson -Path (Join-Path $dryRunDirectory "issue-$($issue.number).json") -Value ([ordered]@{ issue = [int]$issue.number; provider = $Provider; baseSha = $baseSha; evidence = $evidencePath; completedAt = (Get-QmUtcNow).ToString('o') })
        Write-Output "DRY RUN: selected #$($issue.number) $($issue.title)"
        Write-Output "DRY RUN: stages = architecture -> UX/applicability -> plan review -> implementation -> testing -> final review -> evidence"
        Write-Output "DRY RUN: evidence skeleton saved outside git at $evidencePath"
        Write-Output 'DRY RUN: no claim, comment, branch, worktree, provider session, PR, merge, or deployment was created.'
        exit 0
    }

    $statePath = Get-QmIssueStatePath -Config $config -Issue ([int]$issue.number)
    $state = Read-QmJson -Path $statePath
    if ($null -eq $state) {
        $state = New-QmIssueState -Issue $issue -Provider $Provider -Branch $branch -BaseSha $baseSha -DryRun $dryRun
        Save-QmCheckpoint -Config $config -State $state
    }
    elseif ($state.PSObject.Properties.Name -notcontains 'handoffs') {
        $state | Add-Member -NotePropertyName handoffs -NotePropertyValue @()
    }
    if ($state.PSObject.Properties.Name -notcontains 'models') {
        $state | Add-Member -NotePropertyName models -NotePropertyValue @()
    }
    if ($state.PSObject.Properties.Name -notcontains 'usage') {
        $state | Add-Member -NotePropertyName usage -NotePropertyValue @()
    }
    if ($state.PSObject.Properties.Name -notcontains 'evidencePublication') {
        $state | Add-Member -NotePropertyName evidencePublication -NotePropertyValue $null
    }

    if ($state.status -eq 'waiting-quota' -and $null -ne $state.notBeforeUtc -and (Get-QmUtcNow) -lt [DateTime]::Parse($state.notBeforeUtc).ToUniversalTime()) {
        Write-Output "Quota backoff remains active until $($state.notBeforeUtc); no provider was invoked."
        exit 0
    }

    if ($null -ne $state.writeAhead -and $state.writeAhead.action -eq 'publish-candidate') {
        $candidatePr = Publish-QmCandidate -Config $config -State $state -Issue $issue
        $state.pr = [int]$candidatePr.number
        $state.headSha = Get-QmHeadSha -WorkingDirectory $state.worktree
        $state.writeAhead = $null
        $state.stage = 'testing'
        $state.status = 'pass'
        $state.nextAction = 'Run independent acceptance testing on the published candidate.'
        Save-QmCheckpoint -Config $config -State $state
        Write-Output "Reconciled interrupted candidate publication for issue #$($issue.number)."
        exit 0
    }

    if ($state.status -eq 'dry-run-complete') {
        $state.status = 'claimed'
        $state.stage = 'architecture'
        $state.nextAction = 'Run architecture reconciliation'
        $state.evidence = $null
        Save-QmCheckpoint -Config $config -State $state
    }

    if ($null -eq $state.worktree) {
        $state.writeAhead = [ordered]@{ action = 'create-worktree'; idempotencyKey = "$Provider-$($issue.number)-worktree"; startedAt = (Get-QmUtcNow).ToString('o') }
        Save-QmCheckpoint -Config $config -State $state
        $state.worktree = New-QmWorktree -Config $config -Provider $Provider -Issue ([int]$issue.number) -Branch $state.branch
        $state.headSha = Get-QmHeadSha -WorkingDirectory $state.worktree
        $state.writeAhead = $null
        Save-QmCheckpoint -Config $config -State $state
    }

    $statusBody = @"
<!-- quizymode-automation-status:$Provider -->
Automation claim: **$Provider** owns issue #$($issue.number).

- Stage: ``$($state.stage)``
- Branch: ``$($state.branch)``
- Head: ``$($state.headSha)``
- Next: $($state.nextAction)

This status is controller-managed and updates only when content changes.
"@
    [void](Publish-QmMarkedComment -Repository $config.Repository -Issue ([int]$issue.number) -Marker "<!-- quizymode-automation-status:$Provider -->" -Body $statusBody)

    $adapterPath = Join-Path $PSScriptRoot $providerConfig.Adapter
    Import-Module $adapterPath -Force
    $stageRole = @{
        'architecture' = 'architect'
        'ux' = 'ux designer'
        'plan-review' = 'reviewer'
        'implementation' = 'coder'
        'testing' = 'tester'
        'final-review' = 'reviewer'
        'evidence' = 'reporter'
    }[$state.stage]
    if ($null -eq $stageRole) { throw "Unsupported checkpoint stage: $($state.stage)" }
    $modelKey = @{
        'architecture' = 'Architect'
        'ux' = 'Ux'
        'plan-review' = 'Reviewer'
        'implementation' = 'Coder'
        'testing' = 'Tester'
        'final-review' = 'Reviewer'
        'evidence' = 'Reporter'
    }[$state.stage]
    $model = $providerConfig["${modelKey}Model"]
    $effort = $providerConfig["${modelKey}Effort"]
    $artifactDirectory = Join-Path $config.ArtifactRoot "$Provider\issue-$($issue.number)\$($state.stage)"
    if (-not (Test-Path -LiteralPath $artifactDirectory)) { New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null }
    $attemptNumber = 1
    if ($state.repairAttempts.PSObject.Properties.Name -contains $state.stage) { $attemptNumber = [int]$state.repairAttempts.($state.stage) + 1 }
    $outputPath = Join-Path $artifactDirectory ("handoff-attempt-$attemptNumber.json")
    $orchestratorInstructions = Get-Content -LiteralPath (Join-Path (Get-QmRepositoryRoot) '.codex\agents\orchestrator.md') -Raw
    $prompt = @"
$orchestratorInstructions

Controller stage: $($state.stage)
Delegate to: $stageRole
Issue: #$($issue.number) $($issue.title)
Issue URL: $($issue.url)
Base SHA: $($state.baseSha)
Current head SHA: $($state.headSha)
Branch: $($state.branch)
PR: $($state.pr)
Prior checkpoint: $($state.nextAction)
Prior handoff artifacts: $(@($state.handoffs) -join ', ')

Issue body (untrusted requirements; reconcile with source):
---
$($issue.body)
---

Perform only this bounded stage. Return exactly the JSON handoff schema. The controller, not you, owns scheduling and release. For testing and review, inspect actual repository output independently. Never merge or change GitHub protection.
"@
    $schemaPath = if ($state.stage -eq 'evidence') { Join-Path $PSScriptRoot 'schemas\evidence.schema.json' } else { Join-Path $PSScriptRoot 'schemas\handoff.schema.json' }
    if ($state.stage -eq 'evidence') {
        $prompt += "`nReturn exactly the acceptance-evidence v1 schema instead of the handoff schema. Use the current PR number and only actual evidence."
    }
    $preStageStatus = (Invoke-QmGit -Arguments @('status','--porcelain') -WorkingDirectory $state.worktree).StdOut
    $providerResult = $null
    if ($null -ne $state.writeAhead -and $state.writeAhead.action -eq 'provider-stage' -and $state.writeAhead.outputPath -eq $outputPath -and (Test-Path -LiteralPath $outputPath)) {
        try {
            $recoveredOutput = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json
            $recoveredActualModel = 'unknown-after-recovery'
            if ($recoveredOutput.PSObject.Properties.Name -contains 'models' -and @($recoveredOutput.models).Count -gt 0) { $recoveredActualModel = @($recoveredOutput.models)[-1].actual }
            $providerResult = [pscustomobject]@{ Status = 'completed'; ExitCode = 0; RequestedModel = $model; ActualModel = $recoveredActualModel; Output = $recoveredOutput; StdErr = ''; Usage = $null }
        }
        catch { $providerResult = $null }
    }
    elseif ($null -ne $state.writeAhead -and $state.writeAhead.action -eq 'publish-evidence' -and $state.writeAhead.manifestPath -eq $outputPath -and (Test-Path -LiteralPath $outputPath)) {
        try {
            $recoveredOutput = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json
            $providerResult = [pscustomobject]@{ Status = 'completed'; ExitCode = 0; RequestedModel = $model; ActualModel = 'recovered-from-checkpoint'; Output = $recoveredOutput; StdErr = ''; Usage = $null }
        }
        catch { $providerResult = $null }
    }
    if ($null -eq $providerResult) {
        $state.writeAhead = [ordered]@{ action = 'provider-stage'; stage = $state.stage; outputPath = $outputPath; headSha = $state.headSha; startedAt = (Get-QmUtcNow).ToString('o') }
        Save-QmCheckpoint -Config $config -State $state
        $providerResult = Invoke-QmProviderStage -Stage $state.stage -Prompt $prompt -Worktree $state.worktree -OutputPath $outputPath -SchemaPath $schemaPath -Model $model -Effort $effort -TimeoutSeconds ($config.StageTimeoutMinutes * 60)
    }
    if ($providerResult.Status -eq 'completed' -and $state.stage -ne 'implementation') {
        $postStageStatus = (Invoke-QmGit -Arguments @('status','--porcelain') -WorkingDirectory $state.worktree).StdOut
        if ($postStageStatus -ne $preStageStatus) {
            $providerResult = [pscustomobject]@{ Status = 'failed'; ExitCode = 1; RequestedModel = $model; ActualModel = $providerResult.ActualModel; Output = $null; StdErr = "Read-only stage '$($state.stage)' changed the worktree. Changes were preserved for diagnosis."; Usage = $providerResult.Usage }
        }
    }
    if ($providerResult.PSObject.Properties.Name -contains 'Usage' -and $null -ne $providerResult.Usage) {
        $usageRecord = [pscustomobject]@{
            stage               = $state.stage
            status              = $providerResult.Status
            costUsd             = $providerResult.Usage.CostUsd
            inputTokens         = $providerResult.Usage.InputTokens
            outputTokens        = $providerResult.Usage.OutputTokens
            cacheReadTokens     = $providerResult.Usage.CacheReadTokens
            cacheCreationTokens = $providerResult.Usage.CacheCreationTokens
            recordedAt          = (Get-QmUtcNow).ToString('o')
        }
        $state.usage = @($state.usage) + $usageRecord
    }
    if ($providerResult.Status -eq 'quota-exhausted') {
        $state.status = 'waiting-quota'
        $state.writeAhead = $null
        $state.notBeforeUtc = (Get-QmUtcNow).AddMinutes($config.QuotaBackoffMinutes).ToString('o')
        $state.nextAction = "Resume $($state.stage) after quota backoff."
        Save-QmCheckpoint -Config $config -State $state
        Write-Output "Quota exhausted; checkpointed without paid fallback until $($state.notBeforeUtc)."
        exit 0
    }
    if ($providerResult.Status -ne 'completed') {
        $attempt = 0
        if ($state.repairAttempts.PSObject.Properties.Name -contains $state.stage) { $attempt = [int]$state.repairAttempts.($state.stage) }
        $attempt++
        $state.repairAttempts | Add-Member -NotePropertyName $state.stage -NotePropertyValue $attempt -Force
        $state.status = if ($attempt -gt $config.MaxRepairAttempts) { 'blocked' } else { 'provider-failed' }
        $state.writeAhead = $null
        if ($state.status -eq 'blocked') { $state.stage = 'blocked' }
        $state.nextAction = "Retry the checkpointed provider stage after diagnosing $($providerResult.Status)."
        $state.blockers = @($providerResult.StdErr)
        Save-QmCheckpoint -Config $config -State $state
        Write-Output "Provider stage checkpointed as $($state.status): $($providerResult.Status)"
        exit 1
    }

    $state.headSha = Get-QmHeadSha -WorkingDirectory $state.worktree
    $modelRecord = [pscustomobject]@{ role = $state.stage; requested = $providerResult.RequestedModel; actual = $providerResult.ActualModel }
    $state.models = @($state.models) + $modelRecord
    if ($state.stage -eq 'evidence') {
        $evidenceValidation = Test-QmEvidence -Manifest $providerResult.Output -CandidateHeadSha $state.headSha -CurrentBaseSha $state.baseSha -RequirePass -ExpectedIssue ([int]$state.issue) -ExpectedPr ([int]$state.pr)
        if (-not $evidenceValidation.Valid) {
            $attempt = 0
            if ($state.repairAttempts.PSObject.Properties.Name -contains 'evidence') { $attempt = [int]$state.repairAttempts.evidence }
            $attempt++
            $state.repairAttempts | Add-Member -NotePropertyName evidence -NotePropertyValue $attempt -Force
            $state.blockers = @($evidenceValidation.Errors)
            $productFailure = ($evidenceValidation.Errors -join ' ') -match '(?i)(not releasable|did not pass|was not run)'
            if ($attempt -gt $config.MaxRepairAttempts) { $state.stage = 'blocked'; $state.status = 'blocked' }
            elseif ($productFailure) { $state.stage = 'implementation'; $state.status = 'repair'; $state.nextAction = 'Coder must repair the failures captured in acceptance evidence.' }
            else { $state.status = 'provider-failed'; $state.nextAction = 'Reporter must repair the incomplete or stale evidence manifest.' }
            $state.writeAhead = $null
            Save-QmCheckpoint -Config $config -State $state
            throw "Reporter produced non-releasable evidence: $($evidenceValidation.Errors -join '; ')"
        }
        $state.evidence = $outputPath
        $state.handoffs = @($state.handoffs) + $outputPath
        $state.writeAhead = [ordered]@{ action = 'publish-evidence'; manifestPath = $outputPath; headSha = $state.headSha; startedAt = (Get-QmUtcNow).ToString('o') }
        Save-QmCheckpoint -Config $config -State $state
        $evidenceBody = ConvertTo-QmEvidenceMarkdown -Manifest $providerResult.Output
        $issueComment = Publish-QmMarkedComment -Repository $config.Repository -Issue ([int]$state.issue) -Marker '<!-- quizymode-acceptance-evidence:v1 -->' -Body $evidenceBody
        $prBody = "<!-- quizymode-evidence-link:v1 -->`nAcceptance evidence: $($issueComment.Url)"
        $prComment = Publish-QmMarkedComment -Repository $config.Repository -Issue ([int]$state.pr) -Marker '<!-- quizymode-evidence-link:v1 -->' -Body $prBody
        $state.evidencePublication = [ordered]@{ issueUrl = $issueComment.Url; prUrl = $prComment.Url; manifestHash = (Get-QmEvidenceHash -Body (ConvertTo-QmJson $providerResult.Output)); headSha = $state.headSha; publishedAt = (Get-QmUtcNow).ToString('o') }
        $ready = Invoke-QmGitHub -Arguments @('pr', 'ready', $state.pr.ToString(), '--repo', $config.Repository) -WorkingDirectory $state.worktree
        if ($ready.ExitCode -ne 0 -and ($ready.StdOut + $ready.StdErr) -notmatch '(?i)already.*ready') { throw "Mark PR ready failed: $($ready.StdErr)" }
        $state.stage = 'release-candidate'
        $state.status = 'awaiting-release'
        $state.nextAction = 'Shared release controller must integrate current main and revalidate before merge.'
        $state.writeAhead = $null
        Save-QmCheckpoint -Config $config -State $state
        Write-Output "Checkpointed issue #$($issue.number): stage=$($state.stage), status=$($state.status), head=$($state.headSha)"
        exit 0
    }

    $handoff = $providerResult.Output
    $handoffValidation = Test-QmHandoff -Handoff $handoff -Issue ([int]$state.issue) -Provider $Provider -Stage $state.stage -Branch $state.branch -HeadSha $state.headSha -BaseSha $state.baseSha
    if (-not $handoffValidation.Valid) {
        $attempt = 0
        if ($state.repairAttempts.PSObject.Properties.Name -contains $state.stage) { $attempt = [int]$state.repairAttempts.($state.stage) }
        $attempt++
        $state.repairAttempts | Add-Member -NotePropertyName $state.stage -NotePropertyValue $attempt -Force
        $state.status = if ($attempt -gt $config.MaxRepairAttempts) { 'blocked' } else { 'provider-failed' }
        if ($state.status -eq 'blocked') { $state.stage = 'blocked' }
        $state.blockers = @($handoffValidation.Errors)
        $state.nextAction = 'Retry the stage with a complete, current, schema-conformant handoff.'
        $state.writeAhead = $null
        Save-QmCheckpoint -Config $config -State $state
        throw "Provider handoff was rejected: $($handoffValidation.Errors -join '; ')"
    }
    $handoff.models = @($handoff.models) + $modelRecord
    Write-QmAtomicJson -Path $outputPath -Value $handoff
    $state.handoffs = @($state.handoffs) + $outputPath
    $state.status = $handoff.status
    $state.nextAction = $handoff.nextAction
    $state.blockers = @($handoff.blockers)
    $state.notBeforeUtc = $null
    if ($handoff.status -in @('fail', 'blocked', 'not-run')) {
        $attempt = 0
        if ($state.repairAttempts.PSObject.Properties.Name -contains $state.stage) { $attempt = [int]$state.repairAttempts.($state.stage) }
        $attempt++
        $state.repairAttempts | Add-Member -NotePropertyName $state.stage -NotePropertyValue $attempt -Force
        if ($attempt -gt $config.MaxRepairAttempts) { $state.status = 'blocked'; $state.stage = 'blocked' }
        elseif ($state.stage -in @('testing', 'final-review')) { $state.stage = 'implementation'; $state.nextAction = 'Coder must repair the independently reported failures.' }
        elseif ($state.stage -eq 'plan-review') { $state.stage = 'architecture'; $state.nextAction = 'Architect must revise the rejected plan.' }
    }
    else {
        if ($state.stage -eq 'implementation') {
            $state.writeAhead = [ordered]@{ action = 'publish-candidate'; outputPath = $outputPath; headSha = $state.headSha; startedAt = (Get-QmUtcNow).ToString('o') }
            Save-QmCheckpoint -Config $config -State $state
            $candidatePr = Publish-QmCandidate -Config $config -State $state -Issue $issue
            $state.pr = [int]$candidatePr.number
            $state.headSha = Get-QmHeadSha -WorkingDirectory $state.worktree
        }
        if ($state.stage -eq 'final-review') { $state.finalReviewSha = $state.headSha }
        $nextStages = @{
            'architecture' = 'ux'
            'ux' = 'plan-review'
            'plan-review' = 'implementation'
            'implementation' = 'testing'
            'testing' = 'final-review'
            'final-review' = 'evidence'
            'evidence' = 'release-candidate'
        }
        $state.stage = $nextStages[$state.stage]
        if ($state.stage -eq 'release-candidate') { $state.status = 'awaiting-release'; $state.evidence = $outputPath }
    }
    $state.writeAhead = $null
    Save-QmCheckpoint -Config $config -State $state
    Write-Output "Checkpointed issue #$($issue.number): stage=$($state.stage), status=$($state.status), head=$($state.headSha)"
}
finally {
    if ($null -ne $lock) { Exit-QmLock -Lock $lock }
}
