# Exercises scripts/verify-openapi.ps1 end to end. Usage: verify-matrix.ps1 -Repo <dir> -Out <dir> -Tag <os> -Shell <powershell|pwsh>
param([string]$Repo, [string]$Out, [string]$Tag, [string]$Shell)
$ErrorActionPreference = "Continue"
Set-Location $Repo
$results = @()
function Run-Case([string]$Name, [string]$Ref, [string]$ScriptRef, [string[]]$ScriptArgs, [hashtable]$Env = @{}) {
    & git -c core.safecrlf=false checkout -q -f --detach $Ref 2>$null
    $scriptPath = "scripts/verify-openapi.ps1"
    if ($ScriptRef) { & git show "${ScriptRef}:scripts/verify-openapi.ps1" | Set-Content -Path "$Out/old-verify-openapi.ps1" -Encoding ascii; $scriptPath = "$Out/old-verify-openapi.ps1" }
    Remove-Item -ErrorAction SilentlyContinue "$Out/$Tag-$Name.diff", "$Out/$Tag-$Name.ghout", "$Out/$Tag-$Name.log", "$Out/$Tag-$Name.log.stderr"
    $saved = @{}
    foreach ($k in $Env.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); Set-Item -Path "Env:$k" -Value $Env[$k] }
    Set-Item -Path Env:GITHUB_OUTPUT -Value "$Out/$Tag-$Name.ghout"
    $log = "$Out/$Tag-$Name.log"
    $argsList = @("-NoProfile", "-File", $scriptPath, "-Configuration", "Release") + $ScriptArgs
    $p = Start-Process -FilePath $Shell -ArgumentList $argsList -NoNewWindow -Wait -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.stderr"
    foreach ($k in $Env.Keys) { if ($null -eq $saved[$k]) { Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue } else { Set-Item -Path "Env:$k" -Value $saved[$k] } }
    Remove-Item -Path Env:GITHUB_OUTPUT -ErrorAction SilentlyContinue
    $all = (Get-Content $log -Raw) + (Get-Content "$log.stderr" -Raw)
    $script:results += [pscustomobject]@{
        Case = $Name; Ref = (& git rev-parse --short HEAD); Exit = $p.ExitCode
        InSync = [bool]($all -match "(?m)^OpenAPI artifact is in sync\."); Drift = [bool]($all -match "(?m)^OpenAPI artifact is out of date")
        GitWarnings = ([regex]::Matches($all, "git: ")).Count; NativeCommandError = [bool]($all -match "NativeCommandError")
        StderrBytes = (Get-Item "$log.stderr").Length
        GhOutput = if (Test-Path "$Out/$Tag-$Name.ghout") { ((Get-Content "$Out/$Tag-$Name.ghout") -join ";") } else { "" }
        DiffMentionsChange = if (Test-Path "$Out/$Tag-$Name.diff") { [bool](Select-String -Path "$Out/$Tag-$Name.diff" -Pattern "changedBy" -Quiet) } else { $false }
    }
    & git -c core.safecrlf=false checkout -q -f -- . 2>$null
}
Run-Case "A-in-sync" "fix/openapi-newline-reproducibility" "" @()
Run-Case "B-api-change-strict" "repro/negative" "" @()
Run-Case "B2-old-script-same-ref-after-build" "repro/negative" "origin/main" @()
Run-Case "C-api-change-warn-only" "repro/negative" "" @("-WarnOnlyOnArtifactDiff", "-DiffOutputPath", "$Out/$Tag-C-api-change-warn-only.diff")
Run-Case "D-git-failure" "fix/openapi-newline-reproducibility" "" @() @{ GIT_DIR = "$Out/no-such-git-dir" }
Run-Case "E-old-script-api-change-warn-only" "repro/negative" "origin/main" @("-WarnOnlyOnArtifactDiff", "-DiffOutputPath", "$Out/$Tag-E-old-script-api-change-warn-only.diff")
$results | Format-Table -AutoSize | Out-String -Width 250 | Tee-Object -FilePath "$Out/$Tag-matrix.txt"
$results | ConvertTo-Json | Set-Content "$Out/$Tag-matrix.json"
