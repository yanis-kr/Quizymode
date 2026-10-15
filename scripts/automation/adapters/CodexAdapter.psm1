Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-QmProviderContract {
    return [pscustomobject]@{
        Name = 'codex'
        ContractVersion = 1
        Supports = @('architecture', 'ux', 'plan-review', 'implementation', 'testing', 'final-review', 'evidence')
        Authentication = 'Existing Codex subscription login only'
    }
}

function Invoke-QmProviderStage {
    param(
        [Parameter(Mandatory = $true)][string]$Stage,
        [Parameter(Mandatory = $true)][string]$Prompt,
        [Parameter(Mandatory = $true)][string]$Worktree,
        [Parameter(Mandatory = $true)][string]$OutputPath,
        [Parameter(Mandatory = $true)][string]$SchemaPath,
        [Parameter(Mandatory = $true)][string]$Model,
        [Parameter(Mandatory = $true)][ValidateSet('low', 'medium', 'high', 'xhigh', 'max', 'ultra')][string]$Effort,
        [int]$TimeoutSeconds = 2700
    )
    $arguments = @(
        'exec', '--model', $Model,
        '-c', "model_reasoning_effort=`"$Effort`"",
        '--sandbox', 'workspace-write',
        '--cd', $Worktree,
        '--json',
        '--output-schema', $SchemaPath,
        '--output-last-message', $OutputPath,
        '-'
    )
    $result = Invoke-QmNative -FilePath 'codex.exe' -Arguments $arguments -WorkingDirectory $Worktree -TimeoutSeconds $TimeoutSeconds -StandardInput $Prompt
    $noUsage = [pscustomobject]@{ CostUsd = $null; InputTokens = $null; OutputTokens = $null; CacheReadTokens = $null; CacheCreationTokens = $null }
    if ($result.TimedOut) {
        return [pscustomobject]@{ Status = 'timeout'; ExitCode = $null; RequestedModel = $Model; ActualModel = $null; Output = $null; StdErr = $result.StdErr; Usage = $noUsage }
    }
    if ($result.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) {
        if (Test-QmQuotaResult -Text ($result.StdOut + "`n" + $result.StdErr)) {
            return [pscustomobject]@{ Status = 'quota-exhausted'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $null; Output = $null; StdErr = $result.StdErr; Usage = $noUsage }
        }
        return [pscustomobject]@{ Status = 'failed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $null; Output = $null; StdErr = $result.StdErr; Usage = $noUsage }
    }
    $output = Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json
    $actualModel = $Model
    # Best-effort, UNVERIFIED against a real codex.exe (none available in the
    # environment this was written in -- see the issue tracking this gap).
    # `codex exec --json` streams JSONL events to stdout; scans every line
    # (not just the first match) since a token-count event is typically
    # separate from the model-identifying event.
    $inputTokens = $null; $outputTokens = $null; $cachedTokens = $null; $costUsd = $null
    foreach ($line in ($result.StdOut -split "`r?`n")) {
        if ($line -match '"model"\s*:\s*"([^"]+)"') { $actualModel = $Matches[1] }
        if ($line -match '"input_tokens"\s*:\s*(\d+)') { $inputTokens = [double]$Matches[1] }
        if ($line -match '"output_tokens"\s*:\s*(\d+)') { $outputTokens = [double]$Matches[1] }
        if ($line -match '"cached_input_tokens"\s*:\s*(\d+)') { $cachedTokens = [double]$Matches[1] }
        if ($line -match '"total_cost_usd"\s*:\s*([\d.]+)') { $costUsd = [double]$Matches[1] }
    }
    $usage = [pscustomobject]@{ CostUsd = $costUsd; InputTokens = $inputTokens; OutputTokens = $outputTokens; CacheReadTokens = $cachedTokens; CacheCreationTokens = $null }
    return [pscustomobject]@{ Status = 'completed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $actualModel; Output = $output; StdErr = $result.StdErr; Usage = $usage }
}

Export-ModuleMember -Function Get-QmProviderContract, Invoke-QmProviderStage
