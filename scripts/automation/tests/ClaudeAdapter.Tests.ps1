$modulePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Quizymode.Automation.psm1'
Import-Module $modulePath -Force
$adapterPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'adapters\ClaudeAdapter.psm1'
Import-Module $adapterPath -Force

Describe 'Claude provider adapter contract' {
    It 'declares the required capabilities and subscription-only authentication' {
        $contract = Get-QmProviderContract
        $contract.Name | Should Be 'claude'
        ($contract.Supports -contains 'implementation') | Should Be $true
        $contract.Authentication | Should Match 'subscription'
    }

    It 'rejects a stage with no agent mapping before invoking the CLI' {
        { Invoke-QmProviderStage -Stage 'not-a-real-stage' -Prompt 'x' -Worktree $TestDrive -OutputPath (Join-Path $TestDrive 'out.json') -SchemaPath (Join-Path $TestDrive 'schema.json') -Model 'sonnet' -Effort 'medium' } | Should Throw
    }
}

Describe 'Claude provider adapter stage invocation' {
    BeforeEach {
        $script:schemaPath = Join-Path $TestDrive 'handoff.schema.json'
        Set-Content -LiteralPath $schemaPath -Value '{"type":"object"}'
        $script:outputPath = Join-Path $TestDrive 'handoff-attempt-1.json'
        if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
    }

    It 'parses a schema-valid completed response and records the actual model' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            $envelope = @{ type = 'result'; subtype = 'success'; model = 'claude-opus-4-8'; result = (ConvertTo-Json @{ schemaVersion = 1; status = 'pass' }) } | ConvertTo-Json -Compress
            [pscustomobject]@{ ExitCode = 0; StdOut = $envelope; StdErr = ''; TimedOut = $false }
        }
        Mock -ModuleName ClaudeAdapter -CommandName Test-QmQuotaResult -MockWith { $false }

        $result = Invoke-QmProviderStage -Stage 'architecture' -Prompt 'plan it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'opus' -Effort 'high'

        $result.Status | Should Be 'completed'
        $result.RequestedModel | Should Be 'opus'
        $result.ActualModel | Should Be 'claude-opus-4-8'
        $result.Output.status | Should Be 'pass'
        (Test-Path -LiteralPath $outputPath) | Should Be $true
        (Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json).status | Should Be 'pass'
        Assert-MockCalled -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -Times 1 -ParameterFilter { $StandardInput -eq 'plan it' }
    }

    It 'extracts cost and token usage from a successful envelope' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            $envelope = @{
                type = 'result'; subtype = 'success'; model = 'claude-opus-4-8'
                total_cost_usd = 0.0194564
                usage = @{ input_tokens = 9; output_tokens = 43; cache_read_input_tokens = 15854; cache_creation_input_tokens = 8529 }
                result = (ConvertTo-Json @{ schemaVersion = 1; status = 'pass' })
            } | ConvertTo-Json -Compress
            [pscustomobject]@{ ExitCode = 0; StdOut = $envelope; StdErr = ''; TimedOut = $false }
        }
        Mock -ModuleName ClaudeAdapter -CommandName Test-QmQuotaResult -MockWith { $false }

        $result = Invoke-QmProviderStage -Stage 'architecture' -Prompt 'plan it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'opus' -Effort 'high'

        $result.Usage.CostUsd | Should Be 0.0194564
        $result.Usage.InputTokens | Should Be 9
        $result.Usage.OutputTokens | Should Be 43
        $result.Usage.CacheReadTokens | Should Be 15854
        $result.Usage.CacheCreationTokens | Should Be 8529
    }

    It 'still reports usage on an error envelope, since the call was still billed' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            $envelope = @{ type = 'result'; subtype = 'error_max_turns'; model = 'claude-sonnet-5'; total_cost_usd = 0.002; usage = @{ input_tokens = 5; output_tokens = 1 } } | ConvertTo-Json -Compress
            [pscustomobject]@{ ExitCode = 0; StdOut = $envelope; StdErr = ''; TimedOut = $false }
        }
        Mock -ModuleName ClaudeAdapter -CommandName Test-QmQuotaResult -MockWith { $false }

        $result = Invoke-QmProviderStage -Stage 'plan-review' -Prompt 'review it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'opus' -Effort 'high'

        $result.Status | Should Be 'failed'
        $result.Usage.CostUsd | Should Be 0.002
    }

    It 'returns a usage object with null fields rather than throwing when there is no envelope at all' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            [pscustomobject]@{ ExitCode = $null; StdOut = ''; StdErr = ''; TimedOut = $true }
        }

        $result = Invoke-QmProviderStage -Stage 'implementation' -Prompt 'code it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'sonnet' -Effort 'medium'

        $result.Status | Should Be 'timeout'
        $result.Usage.CostUsd | Should Be $null
    }

    It 'extracts the JSON object when a custom agent persona wraps it in prose' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            $proseResult = 'Sure, here is the plan: ' + (ConvertTo-Json @{ schemaVersion = 1; status = 'pass' } -Compress) + ' Trailing notation may use {0,1,2}.'
            $envelope = @{ type = 'result'; subtype = 'success'; model = 'claude-opus-4-8'; result = $proseResult } | ConvertTo-Json -Compress
            [pscustomobject]@{ ExitCode = 0; StdOut = $envelope; StdErr = ''; TimedOut = $false }
        }
        Mock -ModuleName ClaudeAdapter -CommandName Test-QmQuotaResult -MockWith { $false }

        $result = Invoke-QmProviderStage -Stage 'architecture' -Prompt 'plan it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'opus' -Effort 'high'

        $result.Status | Should Be 'completed'
        $result.Output.status | Should Be 'pass'
    }

    It 'reports quota-exhausted without treating it as a hard failure' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            [pscustomobject]@{ ExitCode = 1; StdOut = ''; StdErr = 'Error: rate limit exceeded, retry later'; TimedOut = $false }
        }
        Mock -ModuleName ClaudeAdapter -CommandName Test-QmQuotaResult -MockWith { $true }

        $result = Invoke-QmProviderStage -Stage 'testing' -Prompt 'test it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'sonnet' -Effort 'medium'

        $result.Status | Should Be 'quota-exhausted'
        (Test-Path -LiteralPath $outputPath) | Should Be $false
    }

    It 'recognizes Claude JSON session-limit envelopes even when the CLI exits zero' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            $envelope = @{ type='result'; subtype='success'; is_error=$true; api_error_status=429; result='You have hit your session limit' } | ConvertTo-Json -Compress
            [pscustomobject]@{ ExitCode = 0; StdOut = $envelope; StdErr = ''; TimedOut = $false }
        }
        $result = Invoke-QmProviderStage -Stage 'testing' -Prompt 'test it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'sonnet' -Effort 'medium'
        $result.Status | Should Be 'quota-exhausted'
    }

    It 'reports timeout distinctly from a hard CLI failure' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            [pscustomobject]@{ ExitCode = $null; StdOut = ''; StdErr = ''; TimedOut = $true }
        }

        $result = Invoke-QmProviderStage -Stage 'implementation' -Prompt 'code it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'sonnet' -Effort 'medium'

        $result.Status | Should Be 'timeout'
    }

    It 'treats a malformed CLI envelope as failed, not a silent pass' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            [pscustomobject]@{ ExitCode = 0; StdOut = '<<not json>>'; StdErr = ''; TimedOut = $false }
        }
        Mock -ModuleName ClaudeAdapter -CommandName Test-QmQuotaResult -MockWith { $false }

        $result = Invoke-QmProviderStage -Stage 'evidence' -Prompt 'report it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'haiku' -Effort 'medium'

        $result.Status | Should Be 'failed'
        $result.StdErr | Should Match 'Malformed'
        (Test-Path -LiteralPath $outputPath) | Should Be $false
    }

    It 'treats a non-success subtype as failed even with a clean exit code' {
        Mock -ModuleName ClaudeAdapter -CommandName Invoke-QmNative -MockWith {
            $envelope = @{ type = 'result'; subtype = 'error_max_turns'; model = 'claude-sonnet-5' } | ConvertTo-Json -Compress
            [pscustomobject]@{ ExitCode = 0; StdOut = $envelope; StdErr = ''; TimedOut = $false }
        }
        Mock -ModuleName ClaudeAdapter -CommandName Test-QmQuotaResult -MockWith { $false }

        $result = Invoke-QmProviderStage -Stage 'plan-review' -Prompt 'review it' -Worktree $TestDrive -OutputPath $outputPath -SchemaPath $schemaPath -Model 'opus' -Effort 'high'

        $result.Status | Should Be 'failed'
        $result.ActualModel | Should Be 'claude-sonnet-5'
    }
}
