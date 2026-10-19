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

    Context 'destructive EF Core migrations (#143)' {
        $config = Import-PowerShellDataFile -Path (Join-Path (Split-Path -Parent $PSScriptRoot) 'automation.config.psd1')
        $repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
        $migrations = Join-Path $repoRoot 'src\Quizymode.Api\Migrations'
        function Test-Destructive([string]$Content) {
            @(Get-QmProtectedScopes -ChangedPaths @() -MigrationContents @($Content) -Config $config) -contains 'destructive-migration'
        }
        function New-Migration([string]$Up, [string]$Down) {
            "public partial class M : Migration {`n protected override void Up(MigrationBuilder migrationBuilder) {`n$Up`n }`n protected override void Down(MigrationBuilder migrationBuilder) {`n$Down`n }`n}"
        }

        It 'flags typed DropColumn, DropTable and DropSchema calls in Up' {
            (Test-Destructive (New-Migration -Up 'migrationBuilder.DropColumn(name: "Foo", table: "Bar");' -Down '')) | Should Be $true
            (Test-Destructive (New-Migration -Up 'migrationBuilder.DropTable(name: "Baz");' -Down '')) | Should Be $true
            (Test-Destructive (New-Migration -Up 'migrationBuilder.DropSchema(name: "old");' -Down '')) | Should Be $true
            (Test-Destructive (New-Migration -Up 'migrationBuilder.DropColumn<int>(name: "Foo", table: "Bar");' -Down '')) | Should Be $true
        }

        It 'does not flag an additive migration whose Down drops what Up creates' {
            (Test-Destructive (New-Migration -Up 'migrationBuilder.CreateTable(name: "Baz", columns: table => new { });' -Down 'migrationBuilder.DropTable(name: "Baz");')) | Should Be $false
            (Test-Destructive (New-Migration -Up 'migrationBuilder.AddColumn<bool>(name: "IsInternal", table: "Users");' -Down 'migrationBuilder.DropColumn(name: "IsInternal", table: "Users");')) | Should Be $false
        }

        It 'does not flag schema-only drops such as indexes and foreign keys' {
            (Test-Destructive (New-Migration -Up 'migrationBuilder.DropIndex(name: "IX_A", table: "A"); migrationBuilder.DropForeignKey(name: "FK_A", table: "A");' -Down '')) | Should Be $false
        }

        It 'still flags raw SQL in Up and scans scripts without an Up method as a whole' {
            (Test-Destructive (New-Migration -Up 'migrationBuilder.Sql("DROP TABLE Legacy;");' -Down '')) | Should Be $true
            (Test-Destructive (New-Migration -Up 'migrationBuilder.Sql("TRUNCATE Audits;");' -Down '')) | Should Be $true
            (Test-Destructive 'ALTER TABLE x ADD y int; DROP TABLE z;') | Should Be $true
        }

        It 'classifies the repository''s real migrations' {
            (Test-Destructive (Get-Content -Raw (Join-Path $migrations '20260404211221_RemoveSeedIdentityFields.cs'))) | Should Be $true
            (Test-Destructive (Get-Content -Raw (Join-Path $migrations '20260317043433_DropCategoryKeywordsAndRenameSuggestionParent.cs'))) | Should Be $true
            (Test-Destructive (Get-Content -Raw (Join-Path $migrations '20261015184329_AddAnalyticsEvents.cs'))) | Should Be $false
            (Test-Destructive (Get-Content -Raw (Join-Path $migrations '20261015011209_AddInternalTrafficFlags.cs'))) | Should Be $false
            (Test-Destructive (Get-Content -Raw (Join-Path $migrations '20260328221103_AddPageViews.cs'))) | Should Be $false
        }
    }

    It 'parses a database connection string without exposing or truncating password characters' {
        $values = ConvertFrom-QmPgConnectionString -ConnectionString 'Host=localhost;Database=quizymode;Username=agent;Password=a=b=c;SSL Mode=require'
        $values.host | Should Be 'localhost'
        $values.password | Should Be 'a=b=c'
        $values.'ssl mode' | Should Be 'require'
    }
}

Describe 'Quizymode usage summary' {
    It 'sums cost and tokens per provider across multiple issue states' {
        $states = @(
            [pscustomobject]@{ provider = 'claude'; usage = @(
                [pscustomobject]@{ costUsd = 0.01; inputTokens = 100; outputTokens = 20; cacheReadTokens = 50; cacheCreationTokens = 10 },
                [pscustomobject]@{ costUsd = 0.02; inputTokens = 200; outputTokens = 40; cacheReadTokens = $null; cacheCreationTokens = $null }
            ) },
            [pscustomobject]@{ provider = 'codex'; usage = @(
                [pscustomobject]@{ costUsd = $null; inputTokens = 300; outputTokens = $null; cacheReadTokens = $null; cacheCreationTokens = $null }
            ) }
        )
        $summary = @(Get-QmUsageSummary -States $states)
        $claude = $summary | Where-Object { $_.provider -eq 'claude' }
        $codex = $summary | Where-Object { $_.provider -eq 'codex' }

        $claude.costUsd | Should Be 0.03
        $claude.inputTokens | Should Be 300
        $claude.cacheReadTokens | Should Be 50
        $claude.recordedStages | Should Be 2

        $codex.costUsd | Should Be $null
        $codex.outputTokens | Should Be $null
        $codex.inputTokens | Should Be 300
        $codex.recordedStages | Should Be 1
    }

    It 'reports a real zero cost as 0, not as not-reported' {
        $states = @([pscustomobject]@{ provider = 'claude'; usage = @(
            [pscustomobject]@{ costUsd = 0; inputTokens = $null; outputTokens = $null; cacheReadTokens = $null; cacheCreationTokens = $null }
        ) })
        $claude = @(Get-QmUsageSummary -States $states)[0]
        $claude.costUsd | Should Be 0
        $null -eq $claude.costUsd | Should Be $false
        $claude.inputTokens | Should Be $null
    }

    It 'does not throw on a state with no usage field at all (pre-existing checkpoints)' {
        $states = @([pscustomobject]@{ provider = 'claude' })
        { Get-QmUsageSummary -States $states } | Should Not Throw
        (@(Get-QmUsageSummary -States $states)).Count | Should Be 0
    }
}
