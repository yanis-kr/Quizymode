Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Resolve-QmPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [Environment]::ExpandEnvironmentVariables($Path)
}

function Resolve-QmExecutable {
    param([Parameter(Mandatory = $true)][string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) { return $command.Source }
    if ($Name -eq 'gh.exe') {
        $fallback = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
        if (Test-Path -LiteralPath $fallback) { return $fallback }
    }
    return $null
}

function ConvertFrom-QmPgConnectionString {
    param([Parameter(Mandatory = $true)][string]$ConnectionString)
    if ($ConnectionString -match '^postgres(?:ql)?://') {
        $uri = [Uri]$ConnectionString
        $userInfo = $uri.UserInfo.Split(@(':'), 2, [StringSplitOptions]::None)
        return @{
            host = $uri.Host; port = if ($uri.Port -gt 0) { $uri.Port.ToString() } else { '5432' }
            database = $uri.AbsolutePath.TrimStart('/'); username = [Uri]::UnescapeDataString($userInfo[0])
            password = if ($userInfo.Count -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { '' }
            'ssl mode' = 'require'
        }
    }
    $values = @{}
    foreach ($segment in ($ConnectionString -split ';')) {
        if ([string]::IsNullOrWhiteSpace($segment) -or $segment -notmatch '=') { continue }
        $separator = $segment.IndexOf('=')
        $key = $segment.Substring(0, $separator).Trim().ToLowerInvariant()
        $value = $segment.Substring($separator + 1).Trim()
        $values[$key] = $value
    }
    return $values
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
        try {
            $taskkill = Resolve-QmExecutable -Name 'taskkill.exe'
            if ($null -ne $taskkill) {
                $kill = [Diagnostics.Process]::Start($taskkill, "/PID $($process.Id) /T /F")
                [void]$kill.WaitForExit(30000)
            }
            else { $process.Kill() }
        }
        catch { try { $process.Kill() } catch { } }
        return [pscustomobject]@{ ExitCode = $null; StdOut = $stdoutTask.Result; StdErr = $stderrTask.Result; TimedOut = $true }
    }
    return [pscustomobject]@{ ExitCode = $process.ExitCode; StdOut = $stdoutTask.Result; StdErr = $stderrTask.Result; TimedOut = $false }
}

function Invoke-QmGitHub {
    param([string[]]$Arguments, [string]$WorkingDirectory = (Get-QmRepositoryRoot), [int]$TimeoutSeconds = 300)
    $executable = Resolve-QmExecutable -Name 'gh.exe'
    if ($null -eq $executable) { throw 'GitHub CLI executable was not found.' }
    return Invoke-QmNative -FilePath $executable -Arguments $Arguments -WorkingDirectory $WorkingDirectory -TimeoutSeconds $TimeoutSeconds
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
    $files = @('automation.config.psd1', 'Quizymode.Automation.psm1', 'Invoke-Release.ps1', 'Invoke-DatabaseSafety.ps1')
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
        if ($null -ne $existingState -and $existingState.status -in @('released', 'blocked', 'rollback-failed')) { continue }
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
        evidencePublication = $null
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
    return $Text -match '(?i)(quota|usage limit|session limit|rate limit|too many requests|capacity.*try again)'
}

function Test-QmEvidence {
    param(
        [Parameter(Mandatory = $true)]$Manifest,
        [Parameter(Mandatory = $true)][string]$CandidateHeadSha,
        [Parameter(Mandatory = $true)][string]$CurrentBaseSha,
        [switch]$RequirePass,
        [Nullable[int]]$ExpectedIssue,
        [Nullable[int]]$ExpectedPr
    )
    $errors = New-Object Collections.Generic.List[string]
    if ($Manifest.schemaVersion -ne 1) { $errors.Add('Unsupported evidence schemaVersion.') }
    if ($null -ne $ExpectedIssue -and [int]$Manifest.issue -ne [int]$ExpectedIssue) { $errors.Add('Evidence issue does not match the controller issue.') }
    if ($null -ne $ExpectedPr -and [int]$Manifest.pr -ne [int]$ExpectedPr) { $errors.Add('Evidence PR does not match the controller PR.') }
    if ($Manifest.headSha -ne $CandidateHeadSha) { $errors.Add('Evidence is stale for the candidate head SHA.') }
    if ($Manifest.baseSha -ne $CurrentBaseSha) { $errors.Add('Evidence is stale for the current base SHA.') }
    $criteria = @($Manifest.criteria)
    if ($criteria.Count -eq 0) { $errors.Add('At least one acceptance criterion is required.') }
    foreach ($criterion in $criteria) {
        if (@('PASS', 'FAIL', 'NOT RUN', 'BLOCKED', 'N/A') -notcontains $criterion.status) { $errors.Add("Criterion $($criterion.id) has an invalid status.") }
        if ($RequirePass -and @('PASS', 'N/A') -notcontains $criterion.status) { $errors.Add("Criterion $($criterion.id) is not releasable: $($criterion.status).") }
        if ($criterion.status -eq 'N/A' -and [string]::IsNullOrWhiteSpace($criterion.summary)) { $errors.Add("Criterion $($criterion.id) needs an N/A justification.") }
        if ($RequirePass -and $criterion.status -eq 'PASS' -and @($criterion.evidence).Count -eq 0) { $errors.Add("Criterion $($criterion.id) has no supporting evidence.") }
    }
    $commands = @($Manifest.commands)
    if ($RequirePass -and $commands.Count -eq 0) { $errors.Add('At least one executed verification command is required.') }
    foreach ($command in $commands) {
        if ($command.kind -ne 'not-run' -and $null -eq $command.exitCode) { $errors.Add("Command $($command.name) is missing an exit result.") }
        if ($RequirePass -and $command.kind -ne 'not-run' -and $command.exitCode -ne 0) { $errors.Add("Command $($command.name) did not pass (exit $($command.exitCode)).") }
        if ($RequirePass -and $command.kind -eq 'not-run') { $errors.Add("Command $($command.name) was not run.") }
    }
    foreach ($artifact in @($Manifest.artifacts)) {
        if ($artifact.url -notmatch '^https://') { $errors.Add("Artifact $($artifact.name) must use an accessible HTTPS URL, not a local path.") }
        if ([string]::IsNullOrWhiteSpace($artifact.retention)) { $errors.Add("Artifact $($artifact.name) is missing retention/expiry.") }
    }
    return [pscustomobject]@{ Valid = $errors.Count -eq 0; Errors = @($errors) }
}

function Test-QmHandoff {
    param(
        [Parameter(Mandatory = $true)]$Handoff,
        [Parameter(Mandatory = $true)][int]$Issue,
        [Parameter(Mandatory = $true)][string]$Provider,
        [Parameter(Mandatory = $true)][string]$Stage,
        [Parameter(Mandatory = $true)][string]$Branch,
        [Parameter(Mandatory = $true)][string]$HeadSha,
        [Parameter(Mandatory = $true)][string]$BaseSha
    )
    $errors = New-Object Collections.Generic.List[string]
    foreach ($name in @('schemaVersion','issue','provider','stage','status','branch','headSha','baseSha','nextAction','decisions','artifacts','blockers','models')) {
        if ($Handoff.PSObject.Properties.Name -notcontains $name) { $errors.Add("Handoff is missing required field: $name") }
    }
    if ($errors.Count -eq 0) {
        if ($Handoff.schemaVersion -ne 1) { $errors.Add('Unsupported handoff schemaVersion.') }
        if ([int]$Handoff.issue -ne $Issue) { $errors.Add('Handoff issue does not match the controller issue.') }
        if ($Handoff.provider -ne $Provider) { $errors.Add('Handoff provider does not match the active provider.') }
        if ($Handoff.stage -ne $Stage) { $errors.Add('Handoff stage does not match the active stage.') }
        if ($Handoff.branch -ne $Branch) { $errors.Add('Handoff branch does not match the controller branch.') }
        if ($Handoff.headSha -ne $HeadSha) { $errors.Add('Handoff head SHA is stale or mismatched.') }
        if ($Handoff.baseSha -ne $BaseSha) { $errors.Add('Handoff base SHA is stale or mismatched.') }
        if (@('pass','fail','blocked','not-run','skipped') -notcontains $Handoff.status) { $errors.Add('Handoff status is invalid.') }
        if ($Handoff.status -eq 'skipped' -and $Stage -ne 'ux') { $errors.Add('Only the UX stage may be skipped.') }
        if ($Handoff.status -in @('not-run','skipped') -and [string]::IsNullOrWhiteSpace($Handoff.nextAction)) { $errors.Add('A non-executed stage requires an explicit next action.') }
        foreach ($model in @($Handoff.models)) {
            if ([string]::IsNullOrWhiteSpace($model.role) -or [string]::IsNullOrWhiteSpace($model.requested) -or [string]::IsNullOrWhiteSpace($model.actual)) { $errors.Add('Every handoff model record requires role, requested, and actual values.') }
        }
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
        [bool]$ReleaseEnabled = $false
    )
    $reasons = New-Object Collections.Generic.List[string]
    if (-not $ReleaseEnabled) { $reasons.Add('Unattended release is disabled.') }
    if ($HasConflicts) { $reasons.Add('Integration conflicts require the owning provider.') }
    if ($CandidateSha -ne $VerifiedSha) { $reasons.Add('Candidate SHA differs from the verified SHA.') }
    if ($BaseSha -ne $VerifiedBaseSha) { $reasons.Add('Base advanced after verification.') }
    if (-not $IndependentReviewPassed) { $reasons.Add('Independent final review has not passed.') }
    if (-not $EvidencePassed) { $reasons.Add('Acceptance evidence is incomplete or stale.') }
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
        'main-advanced' { return [pscustomobject]@{ Status = 'revalidation-required'; NextStage = 'implementation'; IncrementRepair = $false; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true } }
        'integration-conflict' { return [pscustomobject]@{ Status = 'blocked'; NextStage = 'blocked'; IncrementRepair = $false; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true } }
        'deployment-failed' { return [pscustomobject]@{ Status = 'deployment-failed'; NextStage = 'release-candidate'; IncrementRepair = $false; MergeAllowed = $false; CloseIssue = $false; PreserveWorktree = $true } }
    }
}

function Get-QmReleaseResumeAction {
    param([AllowNull()][string]$ReleaseStatus)
    switch ($ReleaseStatus) {
        'merge-pending' { return 'reconcile-merge' }
        'deployment-pending' { return 'observe-deployment' }
        'rollback-pending' { return 'observe-rollback' }
        'rollback-retry' { return 'retry-rollback' }
        'finalizing' { return 'finalize-issue' }
        default { return 'validate-candidate' }
    }
}

# EF Core migrations contain both directions. Every additive migration's Down() drops what Up() creates
# (for example DropTable for a new table), so only the forward Up() body decides whether a release is
# destructive. Content without an Up() method (for example a raw .sql script) is scanned as a whole.
function Get-QmMigrationForwardBody {
    param([AllowEmptyString()][string]$Content)
    if ([string]::IsNullOrEmpty($Content)) { return '' }
    $up = [regex]::Match($Content, '(?i)\bvoid\s+Up\s*\(')
    if (-not $up.Success) { return $Content }
    $down = [regex]::Match($Content.Substring($up.Index), '(?i)\bvoid\s+Down\s*\(')
    if (-not $down.Success) { return $Content.Substring($up.Index) }
    return $Content.Substring($up.Index, $down.Index)
}

function Get-QmProtectedScopes {
    param([string[]]$ChangedPaths, [string[]]$MigrationContents, [Parameter(Mandatory = $true)][hashtable]$Config)
    $scopes = New-Object Collections.Generic.List[string]
    foreach ($path in $ChangedPaths) {
        $normalized = $path.Replace('\', '/')
        $configuredProtectedPaths = if ($Config.ContainsKey('ProtectedPolicyPaths')) { @($Config.ProtectedPolicyPaths) } else { @('scripts/automation/', '.codex/', '.github/workflows/') }
        foreach ($protectedPath in $configuredProtectedPaths) {
            $prefix = $protectedPath.Replace('\', '/').TrimEnd('/')
            if ($normalized -eq $prefix -or $normalized.StartsWith("$prefix/", [StringComparison]::OrdinalIgnoreCase)) {
                $scope = if ($prefix -eq '.github/workflows') { 'deployment-controls' } else { 'automation-policy' }
                if (-not $scopes.Contains($scope)) { $scopes.Add($scope) }
            }
        }
    }
    foreach ($content in $MigrationContents) {
        $forward = Get-QmMigrationForwardBody -Content $content
        foreach ($pattern in $Config.DestructiveMigrationPatterns) {
            if ($forward -match $pattern) { if (-not $scopes.Contains('destructive-migration')) { $scopes.Add('destructive-migration') } }
        }
    }
    return @($scopes)
}

function Get-QmUsageSummary {
    # Aggregates the per-stage usage records adapters attach to each issue
    # state's `usage` array (added alongside the existing `models` array in
    # Invoke-Controller.ps1) into running totals, so an operator can see
    # cost/token spend without digging through individual checkpoint files.
    # Entries with a $null field (provider/stage didn't report it, e.g. a
    # timeout before any envelope was returned) are skipped for that field
    # rather than treated as zero, so partial data never understates cost.
    param([Parameter(Mandatory = $true)][array]$States)
    $byProvider = [ordered]@{}
    foreach ($state in $States) {
        if ($state.PSObject.Properties.Name -notcontains 'usage') { continue }
        $provider = [string]$state.provider
        if (-not $byProvider.Contains($provider)) {
            $byProvider[$provider] = [ordered]@{
                provider = $provider
                costUsd = 0.0
                inputTokens = 0.0
                outputTokens = 0.0
                cacheReadTokens = 0.0
                cacheCreationTokens = 0.0
                recordedStages = 0
            }
        }
        foreach ($entry in @($state.usage)) {
            $bucket = $byProvider[$provider]
            $hadAny = $false
            foreach ($pair in @(@('costUsd', 'costUsd'), @('inputTokens', 'inputTokens'), @('outputTokens', 'outputTokens'), @('cacheReadTokens', 'cacheReadTokens'), @('cacheCreationTokens', 'cacheCreationTokens'))) {
                $sourceField = $pair[0]
                if ($entry.PSObject.Properties.Name -contains $sourceField -and $null -ne $entry.$sourceField) {
                    $bucket[$pair[1]] = [double]$bucket[$pair[1]] + [double]$entry.$sourceField
                    $hadAny = $true
                }
            }
            if ($hadAny) { $bucket.recordedStages = [int]$bucket.recordedStages + 1 }
        }
    }
    return @($byProvider.Values | ForEach-Object { [pscustomobject]$_ })
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
        deployment = [ordered]@{ status = 'NOT STARTED'; mergeSha = $null; details = 'Dry-run never submits or merges a candidate.' }
    }
}

Export-ModuleMember -Function *-Qm*
