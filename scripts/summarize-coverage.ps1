param(
    [string]$ResultsDirectory = "TestResults/coverage",
    [string]$MarkdownOutputPath = "coverage-summary.md",
    [string]$JsonOutputPath = "coverage-summary.json",
    [string]$FrontendCoverageJsonPath = "",
    [string]$ArchitectureResultsPath = "",
    [string[]]$ExcludedProjects = @("Quizymode.ServiceDefaults")
)

$ErrorActionPreference = "Stop"

function Format-Percent {
    param(
        [double]$Numerator,
        [double]$Denominator
    )

    if ($Denominator -le 0) {
        return "n/a"
    }

    return "{0:N2}%" -f (($Numerator / $Denominator) * 100.0)
}

function Get-BranchCounts {
    param(
        [System.Xml.XmlElement]$LineElement
    )

    $conditionCoverage = $LineElement.GetAttribute("condition-coverage")
    if ([string]::IsNullOrWhiteSpace($conditionCoverage)) {
        return [pscustomobject]@{
            Covered = 0
            Valid = 0
        }
    }

    $match = [regex]::Match($conditionCoverage, '\((\d+)\/(\d+)\)')
    if (-not $match.Success) {
        return [pscustomobject]@{
            Covered = 0
            Valid = 0
        }
    }

    return [pscustomobject]@{
        Covered = [int]$match.Groups[1].Value
        Valid = [int]$match.Groups[2].Value
    }
}

function Get-PackageMetrics {
    param(
        [System.Xml.XmlElement]$PackageElement
    )

    $classElements = @($PackageElement.SelectNodes('./classes/class'))
    $lineMap = @{}
    $branchMap = @{}

    foreach ($classElement in $classElements) {
        $filename = $classElement.GetAttribute("filename")
        if ([string]::IsNullOrWhiteSpace($filename)) {
            $filename = $classElement.GetAttribute("name")
        }

        if (
            $filename -match '[\\/](obj|Migrations)[\\/]' -or
            $filename -like '*.generated.cs'
        ) {
            continue
        }

        $lineElements = @($classElement.SelectNodes('.//line'))
        foreach ($lineElement in $lineElements) {
            $lineNumber = $lineElement.GetAttribute("number")
            $key = "$filename`:$lineNumber"
            $hits = [int]$lineElement.GetAttribute("hits")

            if (-not $lineMap.ContainsKey($key)) {
                $lineMap[$key] = 0
            }

            if ($hits -gt $lineMap[$key]) {
                $lineMap[$key] = $hits
            }

            $branchCounts = Get-BranchCounts -LineElement $lineElement
            if ($branchCounts.Valid -le 0) {
                continue
            }

            if (-not $branchMap.ContainsKey($key)) {
                $branchMap[$key] = [ordered]@{
                    Covered = 0
                    Valid = 0
                }
            }

            if ($branchCounts.Covered -gt $branchMap[$key].Covered) {
                $branchMap[$key].Covered = $branchCounts.Covered
            }

            if ($branchCounts.Valid -gt $branchMap[$key].Valid) {
                $branchMap[$key].Valid = $branchCounts.Valid
            }
        }
    }

    $linesValid = $lineMap.Count
    $linesCovered = @($lineMap.GetEnumerator() | Where-Object { $_.Value -gt 0 }).Count
    $branchesCovered = 0
    $branchesValid = 0

    foreach ($branchEntry in $branchMap.GetEnumerator()) {
        $branchesCovered += $branchEntry.Value.Covered
        $branchesValid += $branchEntry.Value.Valid
    }

    return [pscustomobject]@{
        Name = $PackageElement.GetAttribute("name")
        LinesCovered = $linesCovered
        LinesValid = $linesValid
        BranchesCovered = $branchesCovered
        BranchesValid = $branchesValid
        LineRate = if ($linesValid -gt 0) { [math]::Round(($linesCovered / $linesValid) * 100.0, 2) } else { $null }
        BranchRate = if ($branchesValid -gt 0) { [math]::Round(($branchesCovered / $branchesValid) * 100.0, 2) } else { $null }
    }
}

function Format-Duration {
    param(
        [TimeSpan]$Duration
    )

    if ($Duration.TotalMinutes -ge 1) {
        return "{0:N2} min" -f $Duration.TotalMinutes
    }

    return "{0:N2} s" -f $Duration.TotalSeconds
}

function Get-ArchitectureSummary {
    param(
        [string]$ResultsPath
    )

    if ([string]::IsNullOrWhiteSpace($ResultsPath) -or -not (Test-Path $ResultsPath)) {
        return $null
    }

    [xml]$trx = Get-Content -Path $ResultsPath
    $ns = [System.Xml.XmlNamespaceManager]::new($trx.NameTable)
    $ns.AddNamespace("t", "http://microsoft.com/schemas/VisualStudio/TeamTest/2010")

    $countersNode = $trx.SelectSingleNode("/t:TestRun/t:ResultSummary/t:Counters", $ns)
    if ($null -eq $countersNode) {
        return $null
    }

    $timesNode = $trx.SelectSingleNode("/t:TestRun/t:Times", $ns)
    $duration = [TimeSpan]::Zero
    if ($null -ne $timesNode) {
        $start = [datetimeoffset]$timesNode.GetAttribute("start")
        $finish = [datetimeoffset]$timesNode.GetAttribute("finish")
        $duration = $finish - $start
    }

    $suiteMap = @{}
    $resultNodes = @($trx.SelectNodes("/t:TestRun/t:Results/t:UnitTestResult", $ns))
    foreach ($resultNode in $resultNodes) {
        $testName = $resultNode.GetAttribute("testName")
        $parts = $testName.Split(".")
        $suiteName = if ($parts.Length -ge 2) { $parts[$parts.Length - 2] } else { "Architecture" }
        $outcome = $resultNode.GetAttribute("outcome")

        if (-not $suiteMap.ContainsKey($suiteName)) {
            $suiteMap[$suiteName] = [ordered]@{
                Name = $suiteName
                Passed = 0
                Failed = 0
                Total = 0
            }
        }

        $suiteMap[$suiteName].Total += 1
        if ($outcome -eq "Passed") {
            $suiteMap[$suiteName].Passed += 1
        }
        else {
            $suiteMap[$suiteName].Failed += 1
        }
    }

    return [pscustomobject]@{
        Total = [int]$countersNode.GetAttribute("total")
        Passed = [int]$countersNode.GetAttribute("passed")
        Failed = [int]$countersNode.GetAttribute("failed")
        Executed = [int]$countersNode.GetAttribute("executed")
        Duration = Format-Duration -Duration $duration
        Suites = @(
            $suiteMap.Values |
                Sort-Object Name |
                ForEach-Object {
                    [pscustomobject]@{
                        Name = $_.Name
                        Passed = $_.Passed
                        Failed = $_.Failed
                        Total = $_.Total
                    }
                }
        )
    }
}

$coverageFiles = @(Get-ChildItem -Path $ResultsDirectory -Recurse -Filter "coverage.cobertura.xml" -File | Sort-Object LastWriteTimeUtc)

if ($coverageFiles.Count -eq 0) {
    throw "No coverage.cobertura.xml files found under '$ResultsDirectory'."
}

$projectMap = @{}
$excludedProjectSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($excludedProject in $ExcludedProjects) {
    if (-not [string]::IsNullOrWhiteSpace($excludedProject)) {
        $null = $excludedProjectSet.Add($excludedProject)
    }
}

foreach ($coverageFile in $coverageFiles) {
    [xml]$xml = Get-Content -Path $coverageFile.FullName
    $coverageNode = $xml.coverage

    $packageNodes = @($coverageNode.packages.package)
    foreach ($packageNode in $packageNodes) {
        if ($null -eq $packageNode) {
            continue
        }

        $packageMetrics = Get-PackageMetrics -PackageElement $packageNode
        if ($excludedProjectSet.Contains($packageMetrics.Name)) {
            continue
        }

        if (-not $projectMap.ContainsKey($packageMetrics.Name)) {
            $projectMap[$packageMetrics.Name] = [ordered]@{
                Name = $packageMetrics.Name
                LinesCovered = 0
                LinesValid = 0
                BranchesCovered = 0
                BranchesValid = 0
            }
        }

        $projectMap[$packageMetrics.Name].LinesCovered += $packageMetrics.LinesCovered
        $projectMap[$packageMetrics.Name].LinesValid += $packageMetrics.LinesValid
        $projectMap[$packageMetrics.Name].BranchesCovered += $packageMetrics.BranchesCovered
        $projectMap[$packageMetrics.Name].BranchesValid += $packageMetrics.BranchesValid
        }
}

$projects = @(
    $projectMap.Values |
        Sort-Object Name |
        ForEach-Object {
            [pscustomobject]@{
                Name = $_.Name
                LinesCovered = $_.LinesCovered
                LinesValid = $_.LinesValid
                BranchesCovered = $_.BranchesCovered
                BranchesValid = $_.BranchesValid
                LineRate = if ($_.LinesValid -gt 0) { [math]::Round(($_.LinesCovered / $_.LinesValid) * 100.0, 2) } else { $null }
                BranchRate = if ($_.BranchesValid -gt 0) { [math]::Round(($_.BranchesCovered / $_.BranchesValid) * 100.0, 2) } else { $null }
            }
        }
)

if ($projects.Count -eq 0) {
    throw "No coverage projects were found after exclusions."
}

$totals = [ordered]@{
    LinesCovered = ($projects | Measure-Object LinesCovered -Sum).Sum
    LinesValid = ($projects | Measure-Object LinesValid -Sum).Sum
    BranchesCovered = ($projects | Measure-Object BranchesCovered -Sum).Sum
    BranchesValid = ($projects | Measure-Object BranchesValid -Sum).Sum
}

$overallLineRate = Format-Percent -Numerator $totals.LinesCovered -Denominator $totals.LinesValid
$overallBranchRate = Format-Percent -Numerator $totals.BranchesCovered -Denominator $totals.BranchesValid

$markdownLines = [System.Collections.Generic.List[string]]::new()
$markdownLines.Add("## Coverage Summary")
$markdownLines.Add("")
$markdownLines.Add("- Line coverage: **$overallLineRate** ($($totals.LinesCovered)/$($totals.LinesValid))")
$markdownLines.Add("- Branch coverage: **$overallBranchRate** ($($totals.BranchesCovered)/$($totals.BranchesValid))")
$markdownLines.Add("- Coverage files: **$($coverageFiles.Count)**")
$markdownLines.Add("")
$markdownLines.Add("## By Project")
$markdownLines.Add("")
$markdownLines.Add("| Project | Line % | Lines | Branch % | Branches |")
$markdownLines.Add("| --- | ---: | ---: | ---: | ---: |")

foreach ($project in $projects) {
    $lineRateDisplay = if ($null -ne $project.LineRate) { "{0:N2}%" -f $project.LineRate } else { "n/a" }
    $branchRateDisplay = if ($null -ne $project.BranchRate) { "{0:N2}%" -f $project.BranchRate } else { "n/a" }
    $markdownLines.Add("| $($project.Name) | $lineRateDisplay | $($project.LinesCovered)/$($project.LinesValid) | $branchRateDisplay | $($project.BranchesCovered)/$($project.BranchesValid) |")
}

$architectureSummary = Get-ArchitectureSummary -ResultsPath $ArchitectureResultsPath
if ($null -ne $architectureSummary) {
    $markdownLines.Add("")
    $markdownLines.Add("## Architecture Tests")
    $markdownLines.Add("")
    $markdownLines.Add("- Total: **$($architectureSummary.Total)**")
    $markdownLines.Add("- Passed: **$($architectureSummary.Passed)**")
    $markdownLines.Add("- Failed: **$($architectureSummary.Failed)**")
    $markdownLines.Add("- Duration: **$($architectureSummary.Duration)**")

    if ($architectureSummary.Suites.Count -gt 0) {
        $markdownLines.Add("")
        $markdownLines.Add("| Suite | Passed | Failed | Total |")
        $markdownLines.Add("| --- | ---: | ---: | ---: |")
        foreach ($suite in $architectureSummary.Suites) {
            $markdownLines.Add("| $($suite.Name) | $($suite.Passed) | $($suite.Failed) | $($suite.Total) |")
        }
    }
}

$frontendSection = ""
if (-not [string]::IsNullOrWhiteSpace($FrontendCoverageJsonPath) -and (Test-Path $FrontendCoverageJsonPath)) {
    $frontendJson = Get-Content -Path $FrontendCoverageJsonPath -Raw | ConvertFrom-Json
    $total = $frontendJson.total
    $feLines = $total.lines
    $feFunctions = $total.functions
    $feStatements = $total.statements
    $feBranches = $total.branches

    $feLinesPct = if ($feLines.total -gt 0) { "{0:N2}%" -f (($feLines.covered / $feLines.total) * 100.0) } else { "n/a" }
    $feFuncPct = if ($feFunctions.total -gt 0) { "{0:N2}%" -f (($feFunctions.covered / $feFunctions.total) * 100.0) } else { "n/a" }
    $feStmtPct = if ($feStatements.total -gt 0) { "{0:N2}%" -f (($feStatements.covered / $feStatements.total) * 100.0) } else { "n/a" }
    $feBranchPct = if ($feBranches.total -gt 0) { "{0:N2}%" -f (($feBranches.covered / $feBranches.total) * 100.0) } else { "n/a" }

    $feLines2 = [System.Collections.Generic.List[string]]::new()
    $feLines2.Add("")
    $feLines2.Add("## Frontend Coverage (Vitest / v8)")
    $feLines2.Add("")
    $feLines2.Add("| Metric | % | Covered / Total |")
    $feLines2.Add("| --- | ---: | ---: |")
    $feLines2.Add("| Lines | $feLinesPct | $($feLines.covered)/$($feLines.total) |")
    $feLines2.Add("| Functions | $feFuncPct | $($feFunctions.covered)/$($feFunctions.total) |")
    $feLines2.Add("| Statements | $feStmtPct | $($feStatements.covered)/$($feStatements.total) |")
    $feLines2.Add("| Branches | $feBranchPct | $($feBranches.covered)/$($feBranches.total) |")
    $frontendSection = ($feLines2 -join [Environment]::NewLine)
    $markdownLines.AddRange($feLines2)
}

$markdown = ($markdownLines -join [Environment]::NewLine)

$markdownDirectory = Split-Path -Parent $MarkdownOutputPath
if (-not [string]::IsNullOrWhiteSpace($markdownDirectory)) {
    New-Item -ItemType Directory -Path $markdownDirectory -Force | Out-Null
}

$jsonDirectory = Split-Path -Parent $JsonOutputPath
if (-not [string]::IsNullOrWhiteSpace($jsonDirectory)) {
    New-Item -ItemType Directory -Path $jsonDirectory -Force | Out-Null
}

$summary = [pscustomobject]@{
    totals = [pscustomobject]@{
        lineCoverage = $overallLineRate
        linesCovered = $totals.LinesCovered
        linesValid = $totals.LinesValid
        branchCoverage = $overallBranchRate
        branchesCovered = $totals.BranchesCovered
        branchesValid = $totals.BranchesValid
        coverageFiles = $coverageFiles.Count
    }
    projects = $projects
    architecture = $architectureSummary
}

$markdown | Set-Content -Path $MarkdownOutputPath -Encoding utf8
$summary | ConvertTo-Json -Depth 5 | Set-Content -Path $JsonOutputPath -Encoding utf8

if ($env:GITHUB_STEP_SUMMARY) {
    $markdown | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
}

if ($env:GITHUB_OUTPUT) {
    "coverage_markdown_path=$MarkdownOutputPath" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    "coverage_json_path=$JsonOutputPath" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    "line_coverage=$overallLineRate" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
    "branch_coverage=$overallBranchRate" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
}

Write-Host $markdown
