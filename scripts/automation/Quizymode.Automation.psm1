Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Resolve-QmPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [Environment]::ExpandEnvironmentVariables($Path)
}

function Get-QmRepositoryRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Get-QmConfig {
    param([string]$Path = (Join-Path $PSScriptRoot 'automation.config.psd1'))
    $config = Import-PowerShellDataFile -Path $Path
    $config.StateRoot = Resolve-QmPath $config.StateRoot
    $config.WorktreeRoot = Resolve-QmPath $config.WorktreeRoot
    $config.ArtifactRoot = Resolve-QmPath $config.ArtifactRoot
    return $config
}

function Initialize-QmDirectories {
    param([Parameter(Mandatory = $true)][hashtable]$Config)
    foreach ($path in @($Config.StateRoot, $Config.WorktreeRoot, $Config.ArtifactRoot, (Join-Path $Config.StateRoot 'locks'), (Join-Path $Config.StateRoot 'issues'))) {
        if (-not (Test-Path -LiteralPath $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }
}

function Get-QmUtcNow {
    return [DateTime]::UtcNow
}

function ConvertTo-QmJson {
    param([Parameter(Mandatory = $true)]$Value)
    return ($Value | ConvertTo-Json -Depth 30)
}

function Write-QmAtomicJson {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $tempPath = Join-Path $directory (([IO.Path]::GetFileName($Path)) + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $backupPath = "$Path.bak"
    try {
        $json = ConvertTo-QmJson $Value
        [IO.File]::WriteAllText($tempPath, $json, (New-Object Text.UTF8Encoding($false)))
        $stream = [IO.File]::Open($tempPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        try { $stream.Flush($true) } finally { $stream.Dispose() }
        if (Test-Path -LiteralPath $Path) {
            [IO.File]::Replace($tempPath, $Path, $backupPath, $true)
        }
        else {
            [IO.File]::Move($tempPath, $Path)
        }
    }
    finally {
        if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath -Force }
    }
}

function Read-QmJson {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}

function Enter-QmLock {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$StaleAfterMinutes = 180
    )
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    try {
        $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    }
    catch {
        $metadata = $null
        try { $metadata = Read-QmJson -Path $Path } catch { }
        $ownerAlive = $false
        if ($null -ne $metadata -and $null -ne $metadata.pid) {
            try { $ownerAlive = $null -ne (Get-Process -Id ([int]$metadata.pid) -ErrorAction Stop) } catch { }
        }
        $oldEnough = (Get-QmUtcNow) -gt ((Get-Item -LiteralPath $Path).LastWriteTimeUtc.AddMinutes($StaleAfterMinutes))
        if ($ownerAlive -or -not $oldEnough) {
            throw "Lock is held: $Path"
        }
        Remove-Item -LiteralPath $Path -Force
        $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    }
    $metadataObject = [ordered]@{
        pid = $PID
        machine = $env:COMPUTERNAME
        acquiredAt = (Get-QmUtcNow).ToString('o')
    }
    $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-QmJson $metadataObject))
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
    return [pscustomobject]@{ Path = $Path; Stream = $stream }
}

function Exit-QmLock {
    param([Parameter(Mandatory = $true)]$Lock)
    if ($null -ne $Lock.Stream) { $Lock.Stream.Dispose() }
    if (Test-Path -LiteralPath $Lock.Path) { Remove-Item -LiteralPath $Lock.Path -Force }
}

function Get-QmControllerStatePath {
    param([Parameter(Mandatory = $true)][hashtable]$Config)
    return (Join-Path $Config.StateRoot 'controller.json')
}

function Get-QmIssueStatePath {
    param([Parameter(Mandatory = $true)][hashtable]$Config, [Parameter(Mandatory = $true)][int]$Issue)
    return (Join-Path (Join-Path $Config.StateRoot 'issues') "$Issue.json")
}

function Save-QmCheckpoint {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Config,
        [Parameter(Mandatory = $true)]$State
    )
    $State.updatedAt = (Get-QmUtcNow).ToString('o')
    Write-QmAtomicJson -Path (Get-QmIssueStatePath -Config $Config -Issue ([int]$State.issue)) -Value $State
}

function Invoke-QmNative {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = (Get-Location).Path,
        [int]$TimeoutSeconds = 300,
        [string]$StandardInput
    )
    $argumentText = (($Arguments | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"' } else { $_ }
    }) -join ' ')
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $argumentText
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.RedirectStandardInput = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    if ($PSBoundParameters.ContainsKey('StandardInput')) { $process.StandardInput.Write($StandardInput) }
    $process.StandardInput.Close()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        try { $process.Kill() } catch { }
        return [pscustomobject]@{ ExitCode = $null; StdOut = $stdoutTask.Result; StdErr = $stderrTask.Result; TimedOut = $true }
    }
    return [pscustomobject]@{ ExitCode = $process.ExitCode; StdOut = $stdoutTask.Result; StdErr = $stderrTask.Result; TimedOut = $false }
}

function Invoke-QmGitHub {
    param([string[]]$Arguments, [string]$WorkingDirectory = (Get-QmRepositoryRoot), [int]$TimeoutSeconds = 300)
    return Invoke-QmNative -FilePath 'gh.exe' -Arguments $Arguments -WorkingDirectory $WorkingDirectory -TimeoutSeconds $TimeoutSeconds
}

function Invoke-QmGit {
    param([string[]]$Arguments, [string]$WorkingDirectory = (Get-QmRepositoryRoot), [int]$TimeoutSeconds = 300)
    return Invoke-QmNative -FilePath 'git.exe' -Arguments $Arguments -WorkingDirectory $WorkingDirectory -TimeoutSeconds $TimeoutSeconds
}

function ConvertFrom-QmCommandJson {
    param([Parameter(Mandatory = $true)]$Result, [Parameter(Mandatory = $true)][string]$Description)
    if ($Result.ExitCode -ne 0) { throw "$Description failed (exit $($Result.ExitCode)): $($Result.StdErr)" }
    if ([string]::IsNullOrWhiteSpace($Result.StdOut)) { return $null }
    return ($Result.StdOut | ConvertFrom-Json)
}

function Get-QmIssue {
    param([Parameter(Mandatory = $true)][int]$Issue, [string]$Repository)
    $args = @('issue', 'view', $Issue.ToString(), '--json', 'number,title,state,body,labels,assignees,url,closedByPullRequestsReferences')
    if ($Repository) { $args += @('--repo', $Repository) }
    return ConvertFrom-QmCommandJson (Invoke-QmGitHub -Arguments $args) "Read issue #$Issue"
}

function Get-QmExistingPullRequest {
    param([Parameter(Mandatory = $true)][int]$Issue, [string]$Repository)
    $args = @('pr', 'list', '--state', 'open', '--search', $Issue.ToString(), '--json', 'number,title,headRefName,headRefOid,url,body')
    if ($Repository) { $args += @('--repo', $Repository) }
    $items = @(ConvertFrom-QmCommandJson (Invoke-QmGitHub -Arguments $args) "Search PR for #$Issue")
    return @($items | Where-Object { $_.title -match "(^|\D)$Issue(\D|$)" -or $_.body -match "(?i)(refs|closes|fixes)\s+#$Issue\b" } | Select-Object -First 1)
}

function Publish-QmMarkedComment {
    param(
        [Parameter(Mandatory = $true)][string]$Repository,
        [Parameter(Mandatory = $true)][int]$Issue,
        [Parameter(Mandatory = $true)][string]$Marker,
        [Parameter(Mandatory = $true)][string]$Body,
        [switch]$DryRun
    )
    if ($Body -notmatch [regex]::Escape($Marker)) { $Body = "$Marker`n$Body" }
    $commentsResult = Invoke-QmGitHub -Arguments @('api', "repos/$Repository/issues/$Issue/comments", '--paginate')
    $comments = @(ConvertFrom-QmCommandJson $commentsResult "Read comments for #$Issue")
    $existing = @($comments | Where-Object { $_.body -like "*$Marker*" } | Select-Object -First 1)
    if ($existing.Count -gt 0 -and (Get-QmEvidenceHash -Body $existing[0].body) -eq (Get-QmEvidenceHash -Body $Body)) {
        return [pscustomobject]@{ Changed = $false; Action = 'unchanged'; Url = $existing[0].html_url }
    }
    if ($DryRun) { return [pscustomobject]@{ Changed = $false; Action = 'dry-run'; Url = $null } }
    $temp = Join-Path ([IO.Path]::GetTempPath()) ("qm-comment-" + [Guid]::NewGuid().ToString('N') + '.md')
    try {
        [IO.File]::WriteAllText($temp, $Body, (New-Object Text.UTF8Encoding($false)))
        if ($existing.Count -gt 0) {
            $result = Invoke-QmGitHub -Arguments @('api', '--method', 'PATCH', "repos/$Repository/issues/comments/$($existing[0].id)", '-F', "body=@$temp")
            $action = 'updated'
        }
        else {
            $result = Invoke-QmGitHub -Arguments @('api', '--method', 'POST', "repos/$Repository/issues/$Issue/comments", '-F', "body=@$temp")
            $action = 'created'
        }
        $comment = ConvertFrom-QmCommandJson $result "Publish comment for #$Issue"
        return [pscustomobject]@{ Changed = $true; Action = $action; Url = $comment.html_url }
    }
    finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    }
}

function Test-QmDependencies {
    param([Parameter(Mandatory = $true)]$Issue, [Parameter(Mandatory = $true)][string]$Repository)
    $matches = [regex]::Matches([string]$Issue.body, '(?im)^\*\*Depends on:\*\*\s*(.+)$')
    if ($matches.Count -eq 0) { return [pscustomobject]@{ Ready = $true; Blockers = @() } }
    $references = [regex]::Matches($matches[0].Groups[1].Value, '#(\d+)')
    $blockers = New-Object Collections.Generic.List[string]
    foreach ($reference in $references) {
        $dependency = Get-QmIssue -Issue ([int]$reference.Groups[1].Value) -Repository $Repository
        if ($dependency.state -ne 'CLOSED') { $blockers.Add("#$($dependency.number) $($dependency.title)") }
    }
    return [pscustomobject]@{ Ready = $blockers.Count -eq 0; Blockers = @($blockers) }
}

function New-QmWorktree {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Config,
        [Parameter(Mandatory = $true)][string]$Provider,
        [Parameter(Mandatory = $true)][int]$Issue,
        [Parameter(Mandatory = $true)][string]$Branch
    )
    $path = Join-Path (Join-Path $Config.WorktreeRoot $Provider) $Issue.ToString()
    if (Test-Path -LiteralPath $path) { return $path }
    $parent = Split-Path -Parent $path
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $existingBranch = Invoke-QmGit -Arguments @('show-ref', '--verify', '--quiet', "refs/heads/$Branch")
    $arguments = if ($existingBranch.ExitCode -eq 0) { @('worktree', 'add', $path, $Branch) } else { @('worktree', 'add', '-b', $Branch, $path, 'origin/main') }
    $result = Invoke-QmGit -Arguments $arguments
    if ($result.ExitCode -ne 0) { throw "Create worktree failed: $($result.StdErr)" }
    return $path
}

function Get-QmHeadSha {
    param([Parameter(Mandatory = $true)][string]$WorkingDirectory, [string]$Revision = 'HEAD')
    $result = Invoke-QmGit -Arguments @('rev-parse', $Revision) -WorkingDirectory $WorkingDirectory
    if ($result.ExitCode -ne 0) { throw "Resolve $Revision failed: $($result.StdErr)" }
    return $result.StdOut.Trim()
}

function Install-QmTrustedPolicy {
    param([Parameter(Mandatory = $true)][hashtable]$Config, [Parameter(Mandatory = $true)][string]$SourceConfigPath)
    $targetDirectory = Join-Path $Config.StateRoot 'trusted-policy'
    if (-not (Test-Path -LiteralPath $targetDirectory)) { New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null }
    $sourceDirectory = Split-Path -Parent $SourceConfigPath
    $files = @('automation.config.psd1', 'Quizymode.Automation.psm1', 'Invoke-Release.ps1')
    $hashes = [ordered]@{}
    foreach ($file in $files) {
        $sourcePath = Join-Path $sourceDirectory $file
        $destinationPath = Join-Path $targetDirectory $file
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
        $hashes[$file] = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $targetPath = Join-Path $targetDirectory 'automation.config.psd1'
    Write-QmAtomicJson -Path (Join-Path $targetDirectory 'installation.json') -Value ([ordered]@{ installedAt = (Get-QmUtcNow).ToString('o'); sourceCommit = (Get-QmHeadSha -WorkingDirectory (Get-QmRepositoryRoot)); files = $hashes })
    return $targetPath
}

function Select-QmIssue {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Config,
        [Parameter(Mandatory = $true)][string]$Provider,
        [Nullable[int]]$RequestedIssue
    )
    $providerConfig = $Config.Providers[$Provider]
    $queue = if ($null -ne $RequestedIssue) { @([int]$RequestedIssue) } else { @($providerConfig.Queue) }
    foreach ($number in $queue) {
        $issue = Get-QmIssue -Issue $number -Repository $Config.Repository
        if ($issue.state -ne 'OPEN') { continue }
        if ($issue.body -notmatch $providerConfig.ReadyPattern) { continue }
        if ($null -eq $RequestedIssue) {
            $branches = Invoke-QmGit -Arguments @('branch', '--all', '--format=%(refname:short)') -WorkingDirectory (Get-QmRepositoryRoot)
            if ($branches.ExitCode -eq 0 -and $branches.StdOut -match "(?m)(^|/)$number(?:-|$)") { continue }
            $existingPr = @(Get-QmExistingPullRequest -Issue $number -Repository $Config.Repository)
            if ($existingPr.Count -gt 0) { continue }
        }
        $existingState = Read-QmJson -Path (Get-QmIssueStatePath -Config $Config -Issue $number)
        if ($null -ne $existingState -and $existingState.provider -ne $Provider -and $existingState.status -notin @('released', 'blocked')) { continue }
        return $issue
    }
    return $null
}

function Publish-QmCandidate {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Config,
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)]$Issue
    )
    $status = Invoke-QmGit -Arguments @('status', '--porcelain') -WorkingDirectory $State.worktree
    if ($status.ExitCode -ne 0) { throw "Read candidate status failed: $($status.StdErr)" }
    if (-not [string]::IsNullOrWhiteSpace($status.StdOut)) {
        $add = Invoke-QmGit -Arguments @('add', '--all') -WorkingDirectory $State.worktree
        if ($add.ExitCode -ne 0) { throw "Stage candidate failed: $($add.StdErr)" }
        $commit = Invoke-QmGit -Arguments @('commit', '-m', "chore: checkpoint issue #$($Issue.number)") -WorkingDirectory $State.worktree
        if ($commit.ExitCode -ne 0) { throw "Commit candidate failed: $($commit.StdErr)" }
    }
    $push = Invoke-QmGit -Arguments @('push', '--set-upstream', 'origin', $State.branch) -WorkingDirectory $State.worktree -TimeoutSeconds 600
    if ($push.ExitCode -ne 0) { throw "Push candidate failed: $($push.StdErr)" }
    $existing = @(Get-QmExistingPullRequest -Issue ([int]$Issue.number) -Repository $Config.Repository)
    if ($existing.Count -gt 0) { return $existing[0] }
    $body = "Refs #$($Issue.number)`n`nController-managed candidate. Acceptance evidence will be linked after independent testing and review."
    $created = Invoke-QmGitHub -Arguments @('pr', 'create', '--repo', $Config.Repository, '--base', $Config.BaseBranch, '--head', $State.branch, '--draft', '--title', "chore: address issue #$($Issue.number)", '--body', $body) -WorkingDirectory $State.worktree
    if ($created.ExitCode -ne 0) { throw "Create candidate PR failed: $($created.StdErr)" }
    $numberResult = Invoke-QmGitHub -Arguments @('pr', 'view', $State.branch, '--repo', $Config.Repository, '--json', 'number,title,headRefName,headRefOid,url,body')
    return ConvertFrom-QmCommandJson $numberResult "Read created PR for #$($Issue.number)"
}

function New-QmIssueState {
    param($Issue, [string]$Provider, [string]$Branch, [string]$BaseSha, [bool]$DryRun)
    return [pscustomobject][ordered]@{
        schemaVersion = 1
        issue = [int]$Issue.number
        issueUrl = [string]$Issue.url
        provider = $Provider
        status = if ($DryRun) { 'dry-run' } else { 'claimed' }
        stage = 'architecture'
        nextAction = 'Run architecture reconciliation'
        branch = $Branch
        worktree = $null
        baseSha = $BaseSha
        headSha = $BaseSha
        pr = $null
        evidence = $null
        finalReviewSha = $null
        handoffs = @()
        models = @()
        repairAttempts = [pscustomobject]@{}
        notBeforeUtc = $null
        blockers = @()
        writeAhead = $null
        release = $null
        updatedAt = (Get-QmUtcNow).ToString('o')
    }
}

function Test-QmQuotaResult {
    param([string]$Text)
    return $Text -match '(?i)(quota|usage limit|rate limit|too many requests|capacity.*try again)'
}

function Test-QmEvidence {
    param(
        [Parameter(Mandatory = $true)]$Manifest,
        [Parameter(Mandatory = $true)][string]$CandidateHeadSha,
        [Parameter(Mandatory = $true)][string]$CurrentBaseSha,
        [switch]$RequirePass
    )
    $errors = New-Object Collections.Generic.List[string]
    if ($Manifest.schemaVersion -ne 1) { $errors.Add('Unsupported evidence schemaVersion.') }
    if ($Manifest.headSha -ne $CandidateHeadSha) { $errors.Add('Evidence is stale for the candidate head SHA.') }
    if ($Manifest.baseSha -ne $CurrentBaseSha) { $errors.Add('Evidence is stale for the current base SHA.') }
    $criteria = @($Manifest.criteria)
    if ($criteria.Count -eq 0) { $errors.Add('At least one acceptance criterion is required.') }
    foreach ($criterion in $criteria) {
        if (@('PASS', 'FAIL', 'NOT RUN', 'BLOCKED', 'N/A') -notcontains $criterion.status) { $errors.Add("Criterion $($criterion.id) has an invalid status.") }
        if ($RequirePass -and @('PASS', 'N/A') -notcontains $criterion.status) { $errors.Add("Criterion $($criterion.id) is not releasable: $($criterion.status).") }
        if ($criterion.status -eq 'N/A' -and [string]::IsNullOrWhiteSpace($criterion.summary)) { $errors.Add("Criterion $($criterion.id) needs an N/A justification.") }
    }
    foreach ($command in @($Manifest.commands)) {
        if ($command.kind -ne 'not-run' -and $null -eq $command.exitCode) { $errors.Add("Command $($command.name) is missing an exit result.") }
    }
    foreach ($artifact in @($Manifest.artifacts)) {
        if ($artifact.url -notmatch '^https://') { $errors.Add("Artifact $($artifact.name) must use an accessible HTTPS URL, not a local path.") }
        if ([string]::IsNullOrWhiteSpace($artifact.retention)) { $errors.Add("Artifact $($artifact.name) is missing retention/expiry.") }
    }
    return [pscustomobject]@{ Valid = $errors.Count -eq 0; Errors = @($errors) }
}

function Get-QmEvidenceHash {
    param([Parameter(Mandatory = $true)][string]$Body)
    $normalized = (($Body -replace "`r`n", "`n").Trim())
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalized))).Replace('-', '').ToLowerInvariant()) } finally { $sha.Dispose() }
}

function ConvertTo-QmEvidenceMarkdown {
    param([Parameter(Mandatory = $true)]$Manifest)
    $lines = New-Object Collections.Generic.List[string]
    $lines.Add('<!-- quizymode-acceptance-evidence:v1 -->')
    $lines.Add('## Acceptance Evidence')
    $lines.Add('')
    $lines.Add("- Issue: #$($Manifest.issue)")
    $lines.Add("- PR: #$($Manifest.pr)")
    $lines.Add(('- Tested head/base: `{0}` / `{1}`' -f $Manifest.headSha, $Manifest.baseSha))
    $lines.Add("- Date/environment: $($Manifest.testedAt) - $($Manifest.environment)")
    $lines.Add('')
    $lines.Add('### Acceptance criteria')
    foreach ($criterion in @($Manifest.criteria)) {
        $lines.Add("- **$($criterion.status)** $($criterion.id): $($criterion.summary)")
        foreach ($item in @($criterion.evidence)) { $lines.Add("  - $item") }
    }
    $lines.Add('')
    $lines.Add('### Commands and tests')
    foreach ($command in @($Manifest.commands)) {
        $exit = if ($null -eq $command.exitCode) { 'not run' } else { "exit $($command.exitCode)" }
        $lines.Add(('- {0} [{1}, {2}]: `{3}`' -f $command.name, $command.kind, $exit, $command.command))
        if ($command.url) { $lines.Add("  - $($command.url)") }
    }
    $lines.Add('')
    $lines.Add('### Artifacts')
    if (@($Manifest.artifacts).Count -eq 0) { $lines.Add('- None.') }
    foreach ($artifact in @($Manifest.artifacts)) { $lines.Add("- [$($artifact.name)]($($artifact.url)) - $($artifact.kind); retention: $($artifact.retention)") }
    $lines.Add('')
    $lines.Add('### Limitations and deployment')
    foreach ($limitation in @($Manifest.limitations)) { $lines.Add("- $limitation") }
    $lines.Add("- Deployment: **$($Manifest.deployment.status)** - $($Manifest.deployment.details)")
    return ($lines -join "`n")
}

function Test-QmManualApproval {
    param(
        [Parameter(Mandatory = $true)][string]$ApprovalPath,
        [Parameter(Mandatory = $true)][string]$CandidateSha,
        [string[]]$RequiredScopes
    )
    if (-not (Test-Path -LiteralPath $ApprovalPath)) { return [pscustomobject]@{ Valid = $false; Reason = 'Manual approval file is missing.' } }
    $approval = Read-QmJson -Path $ApprovalPath
    if ($approval.candidateSha -ne $CandidateSha) { return [pscustomobject]@{ Valid = $false; Reason = 'Manual approval is stale.' } }
    if ([string]::IsNullOrWhiteSpace($approval.approvedBy)) { return [pscustomobject]@{ Valid = $false; Reason = 'Manual approval has no approver.' } }
    foreach ($scope in $RequiredScopes) {
        if (@($approval.scopes) -notcontains $scope) { return [pscustomobject]@{ Valid = $false; Reason = "Manual approval is missing scope: $scope" } }
    }
    return [pscustomobject]@{ Valid = $true; Reason = 'Approved.' }
}

function Test-QmReleaseGate {
    param(
        [Parameter(Mandatory = $true)][string]$CandidateSha,
        [Parameter(Mandatory = $true)][string]$VerifiedSha,
        [Parameter(Mandatory = $true)][string]$BaseSha,
        [Parameter(Mandatory = $true)][string]$VerifiedBaseSha,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Checks,
        [Parameter(Mandatory = $true)][string[]]$RequiredChecks,
        [bool]$HasConflicts = $false,
        [bool]$IndependentReviewPassed = $false,
        [bool]$EvidencePassed = $false,
        [bool]$ReleaseEnabled = $false,
        [bool]$PolicyApprovalPassed = $true
    )
    $reasons = New-Object Collections.Generic.List[string]
    if (-not $ReleaseEnabled) { $reasons.Add('Unattended release is disabled.') }
    if ($HasConflicts) { $reasons.Add('Integration conflicts require the owning provider.') }
    if ($CandidateSha -ne $VerifiedSha) { $reasons.Add('Candidate SHA differs from the verified SHA.') }
    if ($BaseSha -ne $VerifiedBaseSha) { $reasons.Add('Base advanced after verification.') }
    if (-not $IndependentReviewPassed) { $reasons.Add('Independent final review has not passed.') }
    if (-not $EvidencePassed) { $reasons.Add('Acceptance evidence is incomplete or stale.') }
    if (-not $PolicyApprovalPassed) { $reasons.Add('Required manual policy approval is missing or stale.') }
    foreach ($required in $RequiredChecks) {
        $matching = @($Checks | Where-Object { $_.name -eq $required -and $_.sha -eq $CandidateSha })
        if ($matching.Count -eq 0 -or $matching[0].status -ne 'COMPLETED' -or $matching[0].conclusion -ne 'SUCCESS') {
            $reasons.Add("Required check is missing, pending, failed, or stale: $required")
        }
    }
    return [pscustomobject]@{ Allowed = $reasons.Count -eq 0; Reasons = @($reasons) }
}

function Get-QmRecoveryDecision {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('interrupted', 'quota-exhausted', 'checks-failed', 'main-advanced', 'integration-conflict', 'deployment-failed')][string]$Event,
        [Parameter(Mandatory = $true)][string]$CurrentStage,
        [int]$RepairAttempts = 0,
        [int]$MaxRepairAttempts = 2
    )
    switch ($Event) {
        'interrupted' { return [pscustomobject]@{ Status = 'resume'; NextStage = $CurrentStage; IncrementRepair = $false; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true } }
        'quota-exhausted' { return [pscustomobject]@{ Status = 'waiting-quota'; NextStage = $CurrentStage; IncrementRepair = $false; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true } }
        'checks-failed' {
            $nextAttempts = $RepairAttempts + 1
            return [pscustomobject]@{ Status = if ($nextAttempts -gt $MaxRepairAttempts) { 'blocked' } else { 'repair' }; NextStage = if ($nextAttempts -gt $MaxRepairAttempts) { 'blocked' } else { 'implementation' }; IncrementRepair = $true; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true }
        }
        'main-advanced' { return [pscustomobject]@{ Status = 'revalidation-required'; NextStage = 'testing'; IncrementRepair = $false; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true } }
        'integration-conflict' { return [pscustomobject]@{ Status = 'blocked'; NextStage = 'blocked'; IncrementRepair = $false; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true } }
        'deployment-failed' { return [pscustomobject]@{ Status = 'deployment-failed'; NextStage = 'release-candidate'; IncrementRepair = $false; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true } }
    }
}

function Get-QmProtectedScopes {
    param([string[]]$ChangedPaths, [string[]]$MigrationContents, [Parameter(Mandatory = $true)][hashtable]$Config)
    $scopes = New-Object Collections.Generic.List[string]
    foreach ($path in $ChangedPaths) {
        $normalized = $path.Replace('\', '/')
        if ($normalized -like 'scripts/automation/*' -or $normalized -like '.codex/*') { if (-not $scopes.Contains('automation-policy')) { $scopes.Add('automation-policy') } }
        if ($normalized -like '.github/workflows/*') { if (-not $scopes.Contains('deployment-controls')) { $scopes.Add('deployment-controls') } }
    }
    foreach ($content in $MigrationContents) {
        foreach ($pattern in $Config.DestructiveMigrationPatterns) {
            if ($content -match $pattern) { if (-not $scopes.Contains('destructive-migration')) { $scopes.Add('destructive-migration') } }
        }
    }
    return @($scopes)
}

function New-QmDryRunEvidence {
    param([int]$Issue, [string]$HeadSha, [string]$BaseSha)
    return [ordered]@{
        schemaVersion = 1
        issue = $Issue
        pr = 1
        headSha = $HeadSha
        baseSha = $BaseSha
        testedAt = (Get-QmUtcNow).ToString('o')
        environment = 'controller dry-run; no product commands executed'
        criteria = @(
            [ordered]@{ id = 'planning'; status = 'PASS'; summary = 'Issue, dependencies, and planned specialist stages were inspected without mutation.'; evidence = @('Dry-run controller checkpoint.') },
            [ordered]@{ id = 'product-acceptance'; status = 'NOT RUN'; summary = 'Product implementation and acceptance execution are intentionally outside bootstrap dry-run.'; evidence = @() }
        )
        commands = @([ordered]@{ name = 'product verification'; command = 'not executed in dry-run'; exitCode = $null; kind = 'not-run'; url = $null })
        artifacts = @()
        limitations = @('Schema/completeness validation does not prove assertions are true.', 'No merge, issue comment, branch, PR, or product change was created.')
        deployment = [ordered]@{ status = 'NOT STARTED'; mergeSha = $null; details = 'Release is disabled and dry-run never merges.' }
    }
}

Export-ModuleMember -Function *-Qm*
