$modulePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Quizymode.Automation.psm1'
Import-Module $modulePath -Force
$adapterPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'adapters\CodexAdapter.psm1'
Import-Module $adapterPath -Force

Describe 'Codex provider adapter usage extraction (best-effort, unverified against real codex.exe)' {
    BeforeEach {
        $script:schemaPath = Join-Path $TestDrive 'handoff.schema.json'
        Set-Content -LiteralPath $schemaPath -Value '{"type":"object"}'
        $script:outputPath = Join-Path $TestDrive 'handoff-attempt-1.json'
        Set-Content -LiteralPath $outputPath -Value (ConvertTo-Json @{ schemaVersion = 1; status = 'pass' })
    }

    It 'extracts cost and token fields scattered across separate JSONL events' {
        Mock -ModuleName CodexAdapter -CommandName Invoke-QmNative -MockWith {
            $lines = @(
                (ConvertTo-Json @{ type = 'model_selected'; model = 'gpt-6.1-sol' } -Compress),
                (ConvertTo-Json @{ type = 'token_count'; input_tokens = 120; output_tokens = 30; cached_input_tokens = 40 } -Compress),
                (ConvertTo-Json @{ type = 'turn_completed'; total_cost_usd = 0.015 } -Compress)
            )
            [pscustomobject]@{ ExitCode = 0; StdOut = ($lines -join "`n"); StdErr = ''; TimedOut = $false }
        }

        $result = Invoke-QmProviderStage -Stage 'architecture' -Prompt 'plan it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'gpt-6.1-sol' -Effort 'high'

        $result.Status | Should Be 'completed'
        $result.ActualModel | Should Be 'gpt-6.1-sol'
        $result.Usage.InputTokens | Should Be 120
        $result.Usage.OutputTokens | Should Be 30
        $result.Usage.CacheReadTokens | Should Be 40
        $result.Usage.CostUsd | Should Be 0.015
    }

    It 'returns null usage fields rather than throwing when no usage fields are present' {
        Mock -ModuleName CodexAdapter -CommandName Invoke-QmNative -MockWith {
            [pscustomobject]@{ ExitCode = 0; StdOut = (ConvertTo-Json @{ type = 'model_selected'; model = 'gpt-6.1-sol' } -Compress); StdErr = ''; TimedOut = $false }
        }

        $result = Invoke-QmProviderStage -Stage 'testing' -Prompt 'test it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'gpt-6.1-sol' -Effort 'medium'

        $result.Status | Should Be 'completed'
        $result.Usage.CostUsd | Should Be $null
        $result.Usage.InputTokens | Should Be $null
    }

    It 'reports a null usage object (not a throw) on timeout' {
        Mock -ModuleName CodexAdapter -CommandName Invoke-QmNative -MockWith {
            [pscustomobject]@{ ExitCode = $null; StdOut = ''; StdErr = ''; TimedOut = $true }
        }

        $result = Invoke-QmProviderStage -Stage 'testing' -Prompt 'test it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'gpt-6.1-sol' -Effort 'medium'

        $result.Status | Should Be 'timeout'
        $result.Usage.CostUsd | Should Be $null
    }
}
