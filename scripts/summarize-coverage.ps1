param(
    [string]$ResultsDirectory = "TestResults/coverage",
    [string]$MarkdownOutputPath = "coverage-summary.md",
    [string]$JsonOutputPath = "coverage-summary.json"
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

function Get-IntAttributeValue {
    param(
        [System.Xml.XmlElement]$Element,
        [string]$AttributeName
    )

    $raw = $Element.GetAttribute($AttributeName)
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return 0
    }

    return [int]$raw
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

$coverageFiles = @(Get-ChildItem -Path $ResultsDirectory -Recurse -Filter "coverage.cobertura.xml" -File | Sort-Object LastWriteTimeUtc)

if ($coverageFiles.Count -eq 0) {
    throw "No coverage.cobertura.xml files found under '$ResultsDirectory'."
}

$totals = [ordered]@{
    LinesCovered = 0
    LinesValid = 0
    BranchesCovered = 0
    BranchesValid = 0
}

$projectMap = @{}

foreach ($coverageFile in $coverageFiles) {
    [xml]$xml = Get-Content -Path $coverageFile.FullName
    $coverageNode = $xml.coverage

    $totals.LinesCovered += Get-IntAttributeValue -Element $coverageNode -AttributeName "lines-covered"
    $totals.LinesValid += Get-IntAttributeValue -Element $coverageNode -AttributeName "lines-valid"
    $totals.BranchesCovered += Get-IntAttributeValue -Element $coverageNode -AttributeName "branches-covered"
    $totals.BranchesValid += Get-IntAttributeValue -Element $coverageNode -AttributeName "branches-valid"

    $packageNodes = @($coverageNode.packages.package)
    foreach ($packageNode in $packageNodes) {
        if ($null -eq $packageNode) {
            continue
        }

        $packageMetrics = Get-PackageMetrics -PackageElement $packageNode
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
