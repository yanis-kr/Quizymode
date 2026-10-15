Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# Real Claude provider adapter, implemented against the contract declared in
# ClaudeAdapter.contract.psm1 and docs/automation/workflow.md
# (#claude-adapter-contract). Mirrors CodexAdapter.psm1's shape and relies on
# the same shared helpers (Invoke-QmNative, Test-QmQuotaResult,
# Write-QmAtomicJson) already imported into session state by
# Invoke-Controller.ps1 before this module is loaded.
#
# Policy, not just convenience: never pass --bare, --dangerously-skip-permissions,
# or an API-key auth override. The existing claude.exe session is subscription
# auth only; this module does not configure or fall back to any other auth.

function Get-QmBalancedJsonObject {
    # Finds the first top-level {...} object, tracking brace depth and
    # string/escape state so a literal '}' inside a trailing prose
    # sentence (e.g. "indices like {0,1,2}") can't be mistaken for the
    # object's real closing brace -- unlike a plain IndexOf/LastIndexOf scan.
    param([Parameter(Mandatory = $true)][string]$Text)
    $start = $Text.IndexOf('{')
    if ($start -lt 0) { return $null }
    $depth = 0
    $inString = $false
    $escaped = $false
    for ($i = $start; $i -lt $Text.Length; $i++) {
        $ch = $Text[$i]
        if ($inString) {
            if ($escaped) { $escaped = $false }
            elseif ($ch -eq '\') { $escaped = $true }
            elseif ($ch -eq '"') { $inString = $false }
            continue
        }
        if ($ch -eq '"') { $inString = $true; continue }
        if ($ch -eq '{') { $depth++ }
        elseif ($ch -eq '}') {
            $depth--
            if ($depth -eq 0) { return $Text.Substring($start, $i - $start + 1) }
        }
    }
    return $null
}

$script:QmClaudeStageAgentMap = @{
    'architecture'   = 'architect'
    'ux'             = 'ux-designer'
    'plan-review'    = 'reviewer'
    'implementation' = 'coder'
    'testing'        = 'tester'
    'final-review'   = 'reviewer'
    'evidence'       = 'reporter'
}

function Get-QmProviderContract {
    return [pscustomobject]@{
        Name = 'claude'
        ContractVersion = 1
        Supports = @('architecture', 'ux', 'plan-review', 'implementation', 'testing', 'final-review', 'evidence')
        Authentication = 'Existing Claude subscription login only; never use --bare or API-key fallback'
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
        [Parameter(Mandatory = $true)][ValidateSet('low', 'medium', 'high', 'xhigh', 'max')][string]$Effort,
        [int]$TimeoutSeconds = 2700
    )

    $agentName = $script:QmClaudeStageAgentMap[$Stage]
    if ($null -eq $agentName) { throw "Unsupported stage for Claude adapter: $Stage" }
    if (-not (Test-Path -LiteralPath $SchemaPath)) { throw "Schema not found: $SchemaPath" }

    # claude.exe's --json-schema validator resolves dialects/refs locally and
    # cannot fetch the remote "$schema"/"$id" draft URLs our committed
    # schemas declare; strip that metadata (it doesn't affect the actual
    # type/properties/required constraints) before handing the schema to the CLI.
    $schemaObject = Get-Content -LiteralPath $SchemaPath -Raw | ConvertFrom-Json
    foreach ($metaKey in @('$schema', '$id')) {
        if ($schemaObject.PSObject.Properties.Name -contains $metaKey) {
            $schemaObject.PSObject.Properties.Remove($metaKey)
        }
    }
    $schemaJson = $schemaObject | ConvertTo-Json -Depth 20 -Compress

    # Prompt goes over stdin, not as a CLI argument: orchestrator prompts
    # include the full orchestrator instructions plus the raw issue body and
    # can exceed Windows's ~32K CreateProcess command-line limit, which would
    # otherwise throw an uncaught Win32Exception instead of a structured
    # 'failed' status. Mirrors CodexAdapter.psm1's '-' + -StandardInput.
    $arguments = @(
        '-p',
        '--agent', $agentName,
        '--model', $Model,
        '--effort', $Effort,
        '--permission-mode', 'acceptEdits',
        '--output-format', 'json',
        '--json-schema', $schemaJson,
        '--no-session-persistence'
    )
    if ($Stage -ne 'implementation') {
        $readOnlyTools = 'Read,Grep,Glob,Bash(git status *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(rg *),Bash(dotnet test *),Bash(dotnet build *),Bash(npm test *),Bash(npm run build *),Bash(gh issue view *),Bash(gh pr view *),Bash(gh pr diff *)'
        $arguments += @('--allowedTools', $readOnlyTools)
    }

    $result = Invoke-QmNative -FilePath 'claude.exe' -Arguments $arguments -WorkingDirectory $Worktree -TimeoutSeconds $TimeoutSeconds -StandardInput $Prompt

    if ($result.TimedOut) {
        return [pscustomobject]@{ Status = 'timeout'; ExitCode = $null; RequestedModel = $Model; ActualModel = $null; Output = $null; StdErr = $result.StdErr }
    }
    if ($result.ExitCode -ne 0) {
        if (Test-QmQuotaResult -Text ($result.StdOut + "`n" + $result.StdErr)) {
            return [pscustomobject]@{ Status = 'quota-exhausted'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $null; Output = $null; StdErr = $result.StdErr }
        }
        return [pscustomobject]@{ Status = 'failed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $null; Output = $null; StdErr = $result.StdErr }
    }

    $envelope = $null
    try { $envelope = $result.StdOut | ConvertFrom-Json }
    catch {
        return [pscustomobject]@{ Status = 'failed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $null; Output = $null; StdErr = "Malformed claude CLI envelope: $($_.Exception.Message)" }
    }

    $actualModel = if ($envelope.PSObject.Properties.Name -contains 'model' -and $null -ne $envelope.model) { $envelope.model } else { $Model }

    if (($envelope.PSObject.Properties.Name -contains 'is_error' -and $envelope.is_error) -or
        ($envelope.PSObject.Properties.Name -contains 'api_error_status' -and $envelope.api_error_status)) {
        $errorText = [string]$envelope.result
        if (Test-QmQuotaResult -Text $errorText) {
            return [pscustomobject]@{ Status = 'quota-exhausted'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $actualModel; Output = $null; StdErr = $errorText }
        }
        return [pscustomobject]@{ Status = 'failed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $actualModel; Output = $null; StdErr = $errorText }
    }

    if ($envelope.PSObject.Properties.Name -contains 'subtype' -and $envelope.subtype -ne 'success') {
        return [pscustomobject]@{ Status = 'failed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $actualModel; Output = $null; StdErr = "Claude reported subtype '$($envelope.subtype)'" }
    }

    if (-not ($envelope.PSObject.Properties.Name -contains 'result') -or [string]::IsNullOrWhiteSpace($envelope.result)) {
        return [pscustomobject]@{ Status = 'failed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $actualModel; Output = $null; StdErr = 'Claude CLI envelope had no result payload.' }
    }

    # --json-schema is a validation hint, not a hard guarantee: a custom
    # --agent system prompt (ours are prose personas, not JSON-only
    # instructions) can still make the model wrap the JSON in prose. Try the
    # raw result first, then fall back to extracting the first balanced
    # {...} object before giving up. This does not weaken validation further
    # downstream (e.g. Test-QmEvidence) still checks required shape.
    $payload = $null
    $resultText = $envelope.result
    try { $payload = $resultText | ConvertFrom-Json }
    catch {
        $candidate = Get-QmBalancedJsonObject -Text $resultText
        if ($null -ne $candidate) {
            try { $payload = $candidate | ConvertFrom-Json } catch { $payload = $null }
        }
        if ($null -eq $payload) {
            return [pscustomobject]@{ Status = 'failed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $actualModel; Output = $null; StdErr = "Claude's structured result was not valid JSON against $SchemaPath`: $($_.Exception.Message)" }
        }
    }

    Write-QmAtomicJson -Path $OutputPath -Value $payload

    return [pscustomobject]@{ Status = 'completed'; ExitCode = $result.ExitCode; RequestedModel = $Model; ActualModel = $actualModel; Output = $payload; StdErr = $result.StdErr }
}

Export-ModuleMember -Function Get-QmProviderContract, Invoke-QmProviderStage
