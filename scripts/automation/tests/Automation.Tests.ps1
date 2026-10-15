$modulePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Quizymode.Automation.psm1'
Import-Module $modulePath -Force

Describe 'Quizymode automation durable state and locks' {
    It 'rejects a duplicate live controller lock without truncating metadata' {
        $path = Join-Path $TestDrive 'controller.lock'
        $first = Enter-QmLock -Path $path -StaleAfterMinutes 180
        try {
            $beforeLength = $first.Stream.Length
            { Enter-QmLock -Path $path -StaleAfterMinutes 180 } | Should Throw
            $first.Stream.Length | Should Be $beforeLength
            (Test-Path -LiteralPath $path) | Should Be $true
        }
        finally { Exit-QmLock -Lock $first }
    }

    It 'writes valid JSON atomically and keeps a last-good backup' {
        $path = Join-Path $TestDrive 'state.json'
        Write-QmAtomicJson -Path $path -Value ([ordered]@{ generation = 1; stage = 'architecture' })
        Write-QmAtomicJson -Path $path -Value ([ordered]@{ generation = 2; stage = 'ux' })
        (Read-QmJson -Path $path).generation | Should Be 2
        (Read-QmJson -Path "$path.bak").generation | Should Be 1
        @(Get-ChildItem -LiteralPath $TestDrive -Filter '*.tmp').Count | Should Be 0
    }

    It 'resumes an interrupted stage without incrementing a repair attempt' {
        $decision = Get-QmRecoveryDecision -Event interrupted -CurrentStage testing -RepairAttempts 1
        $decision.NextStage | Should Be 'testing'
        $decision.IncrementRepair | Should Be $false
        $decision.PreserveWorktree | Should Be $true
    }
}

Describe 'Quizymode evidence contract' {
    BeforeEach {
        $script:shaA = ('a' * 40)
        $script:shaB = ('b' * 40)
        $script:manifest = [pscustomobject]@{
            schemaVersion = 1
            headSha = $shaA
            baseSha = $shaB
            criteria = @([pscustomobject]@{ id = 'AC-1'; status = 'PASS'; summary = 'Executed.'; evidence = @('CI run') })
            commands = @([pscustomobject]@{ name = 'tests'; kind = 'local'; exitCode = 0 })
            artifacts = @([pscustomobject]@{ name = 'report'; url = 'https://github.com/example/actions/runs/1'; retention = '90 days' })
        }
    }

    It 'rejects stale candidate evidence' {
        $result = Test-QmEvidence -Manifest $manifest -CandidateHeadSha ('c' * 40) -CurrentBaseSha $shaB -RequirePass
        $result.Valid | Should Be $false
        ($result.Errors -join ' ') | Should Match 'stale.*head'
    }

    It 'rejects local artifact paths and missing command exits' {
        $manifest.artifacts[0].url = 'C:\temp\screenshot.png'
        $manifest.commands[0].exitCode = $null
        $result = Test-QmEvidence -Manifest $manifest -CandidateHeadSha $shaA -CurrentBaseSha $shaB
        $result.Valid | Should Be $false
        ($result.Errors -join ' ') | Should Match 'HTTPS'
        ($result.Errors -join ' ') | Should Match 'exit result'
    }

    It 'does not treat schema-valid NOT RUN evidence as releasable' {
        $manifest.criteria[0].status = 'NOT RUN'
        $result = Test-QmEvidence -Manifest $manifest -CandidateHeadSha $shaA -CurrentBaseSha $shaB -RequirePass
        $result.Valid | Should Be $false
    }

    It 'rejects nonzero command exits and mismatched issue or PR identity' {
        $manifest | Add-Member -NotePropertyName issue -NotePropertyValue 110
        $manifest | Add-Member -NotePropertyName pr -NotePropertyValue 142
        $manifest.commands[0].exitCode = 1
        $result = Test-QmEvidence -Manifest $manifest -CandidateHeadSha $shaA -CurrentBaseSha $shaB -RequirePass -ExpectedIssue 110 -ExpectedPr 999
        $result.Valid | Should Be $false
        ($result.Errors -join ' ') | Should Match 'PR does not match'
        ($result.Errors -join ' ') | Should Match 'did not pass'
    }
}

Describe 'Quizymode provider handoff validation' {
    BeforeEach {
        $script:head = ('a' * 40)
        $script:base = ('b' * 40)
        $script:handoff = [pscustomobject]@{
            schemaVersion=1; issue=110; provider='codex'; stage='testing'; status='pass'; branch='codex/110-automation'
            headSha=$head; baseSha=$base; nextAction='Review'; decisions=@(); artifacts=@(); blockers=@(); models=@()
        }
    }

    It 'accepts an exact current handoff' {
        (Test-QmHandoff -Handoff $handoff -Issue 110 -Provider codex -Stage testing -Branch 'codex/110-automation' -HeadSha $head -BaseSha $base).Valid | Should Be $true
    }

    It 'rejects stale identity and non-UX skips' {
        $handoff.headSha = ('c' * 40)
        $handoff.status = 'skipped'
        $result = Test-QmHandoff -Handoff $handoff -Issue 110 -Provider codex -Stage testing -Branch 'codex/110-automation' -HeadSha $head -BaseSha $base
        $result.Valid | Should Be $false
        ($result.Errors -join ' ') | Should Match 'head SHA'
        ($result.Errors -join ' ') | Should Match 'Only the UX'
    }
}

Describe 'Quizymode release failure gates' {
    BeforeEach {
        $script:sha = ('d' * 40)
        $script:checks = @([pscustomobject]@{ name = 'build-test-publish'; status = 'COMPLETED'; conclusion = 'SUCCESS'; sha = $sha })
    }

    It 'blocks release when main advanced after verification' {
        $gate = Test-QmReleaseGate -CandidateSha $sha -VerifiedSha $sha -BaseSha ('e' * 40) -VerifiedBaseSha ('f' * 40) -Checks $checks -RequiredChecks @('build-test-publish') -IndependentReviewPassed $true -EvidencePassed $true -ReleaseEnabled $true
        $gate.Allowed | Should Be $false
        ($gate.Reasons -join ' ') | Should Match 'Base advanced'
        (Get-QmRecoveryDecision -Event main-advanced -CurrentStage release-candidate).NextStage | Should Be 'implementation'
    }

    It 'blocks missing pending failed and stale checks' {
        foreach ($badChecks in @(
            @(),
            @([pscustomobject]@{ name = 'build-test-publish'; status = 'IN_PROGRESS'; conclusion = $null; sha = $sha }),
            @([pscustomobject]@{ name = 'build-test-publish'; status = 'COMPLETED'; conclusion = 'FAILURE'; sha = $sha }),
            @([pscustomobject]@{ name = 'build-test-publish'; status = 'COMPLETED'; conclusion = 'SUCCESS'; sha = ('0' * 40) })
        )) {
            $gate = Test-QmReleaseGate -CandidateSha $sha -VerifiedSha $sha -BaseSha $sha -VerifiedBaseSha $sha -Checks $badChecks -RequiredChecks @('build-test-publish') -IndependentReviewPassed $true -EvidencePassed $true -ReleaseEnabled $true
            $gate.Allowed | Should Be $false
        }
    }

    It 'requires release enablement and never interprets policy changes from candidate config' {
        $gate = Test-QmReleaseGate -CandidateSha $sha -VerifiedSha $sha -BaseSha $sha -VerifiedBaseSha $sha -Checks $checks -RequiredChecks @('build-test-publish') -IndependentReviewPassed $true -EvidencePassed $true -ReleaseEnabled $false
        $gate.Allowed | Should Be $false
        ($gate.Reasons -join ' ') | Should Match 'disabled'
    }

    It 'preserves conflicts and failed deployments without closing the issue' {
        $conflict = Get-QmRecoveryDecision -Event integration-conflict -CurrentStage release-candidate
        $deployment = Get-QmRecoveryDecision -Event deployment-failed -CurrentStage release-candidate
        $conflict.PreserveWorktree | Should Be $true
        $conflict.CloseIssue | Should Be $false
        $deployment.Status | Should Be 'deployment-failed'
        $deployment.CloseIssue | Should Be $false
    }

    It 'allows two repairs and blocks on the third failure' {
        (Get-QmRecoveryDecision -Event checks-failed -CurrentStage testing -RepairAttempts 0 -MaxRepairAttempts 2).Status | Should Be 'repair'
        (Get-QmRecoveryDecision -Event checks-failed -CurrentStage testing -RepairAttempts 1 -MaxRepairAttempts 2).Status | Should Be 'repair'
        (Get-QmRecoveryDecision -Event checks-failed -CurrentStage testing -RepairAttempts 2 -MaxRepairAttempts 2).Status | Should Be 'blocked'
    }

    It 'checkpoints quota exhaustion without repair or provider fallback' {
        $decision = Get-QmRecoveryDecision -Event quota-exhausted -CurrentStage implementation -RepairAttempts 2
        $decision.Status | Should Be 'waiting-quota'
        $decision.NextStage | Should Be 'implementation'
        $decision.IncrementRepair | Should Be $false
    }

    It 'resumes merge deployment rollback and finalization at the durable side effect' {
        (Get-QmReleaseResumeAction -ReleaseStatus 'merge-pending') | Should Be 'reconcile-merge'
        (Get-QmReleaseResumeAction -ReleaseStatus 'deployment-pending') | Should Be 'observe-deployment'
        (Get-QmReleaseResumeAction -ReleaseStatus 'rollback-pending') | Should Be 'observe-rollback'
        (Get-QmReleaseResumeAction -ReleaseStatus 'rollback-retry') | Should Be 'retry-rollback'
        (Get-QmReleaseResumeAction -ReleaseStatus 'finalizing') | Should Be 'finalize-issue'
        (Get-QmReleaseResumeAction -ReleaseStatus 'checks-failed') | Should Be 'validate-candidate'
    }
}

Describe 'Quizymode trusted policy classifier' {
    It 'classifies configured automation deployment controls and destructive migrations for machine gates' {
        $config = @{ ProtectedPolicyPaths = @('scripts/automation/', '.github/workflows/'); DestructiveMigrationPatterns = @('(?i)\bDROP\s+TABLE\b') }
        $scopes = @(Get-QmProtectedScopes -ChangedPaths @('scripts/automation/a.ps1', '.github/workflows/deploy.yml') -MigrationContents @('DROP TABLE Users;') -Config $config)
        ($scopes -contains 'automation-policy') | Should Be $true
        ($scopes -contains 'deployment-controls') | Should Be $true
        ($scopes -contains 'destructive-migration') | Should Be $true
    }

    It 'parses a database connection string without exposing or truncating password characters' {
        $values = ConvertFrom-QmPgConnectionString -ConnectionString 'Host=localhost;Database=quizymode;Username=agent;Password=a=b=c;SSL Mode=require'
        $values.host | Should Be 'localhost'
        $values.password | Should Be 'a=b=c'
        $values.'ssl mode' | Should Be 'require'
    }
}
