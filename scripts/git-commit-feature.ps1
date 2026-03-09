# Summarize uncommitted changes and commit to current feature branch.
# If on main, exits and asks to create a feature branch.

$ErrorActionPreference = "Stop"
$branch = git branch --show-current

if (-not $branch) {
    Write-Host "Not in a git repository." -ForegroundColor Red
    exit 1
}

$mainBranches = @("main", "master")
if ($mainBranches -contains $branch) {
    Write-Host ""
    Write-Host "You are on branch '$branch'. Create a feature branch first, e.g.:" -ForegroundColor Yellow
    Write-Host "  git checkout -b feature/your-feature-name" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

$status = git status --porcelain
if (-not $status) {
    Write-Host "No uncommitted changes." -ForegroundColor Yellow
    exit 0
}

# Build list of changes for body
$lines = $status -split "`n" | Where-Object { $_.Trim() }
$changes = @()
foreach ($line in $lines) {
    $code = $line.Substring(0, 2).Trim()
    $path = $line.Substring(3).Trim()
    $path = $path -replace '^"|"$', ''
    switch -Regex ($code) {
        "^A"  { $changes += "  + $path" }
        "^D"  { $changes += "  - $path" }
        "^M"  { $changes += "  M $path" }
        "^R"  { $changes += "  R $path" }
        "^C"  { $changes += "  C $path" }
        "^U"  { $changes += "  U $path" }
        "^\?\?" { $changes += "  ? $path" }
        default { $changes += "  * $path" }
    }
}

$diffStat = git diff --stat 2>$null
if ($LASTEXITCODE -eq 0 -and $diffStat) {
    $changes += ""
    $changes += "---"
    $changes += $diffStat.Trim()
}

$body = $changes -join "`n"

# Short title: up to ~72 chars
$paths = $lines | ForEach-Object { $_.Substring(3).Trim() -replace '^"|"$', '' }
$pathList = ($paths -join ", ")
if ($pathList.Length -gt 60) {
    $pathList = $pathList.Substring(0, 57) + "..."
}
$fileCount = $paths.Count
$title = "Update: $pathList"
if ($title.Length -gt 72) {
    $title = "Update $fileCount file(s)"
}

git add -A
# First -m is subject, second -m is body (git joins with newline)
git commit -m $title -m $body

if ($LASTEXITCODE -eq 0) {
    Write-Host "Committed to $branch" -ForegroundColor Green
    Write-Host $title -ForegroundColor Cyan
} else {
    Write-Host "Commit failed (e.g. nothing to commit after add)." -ForegroundColor Red
    exit 1
}
