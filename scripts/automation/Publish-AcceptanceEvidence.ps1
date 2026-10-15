[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [switch]$DryRun
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force
$config = Get-QmConfig
$manifest = Read-QmJson -Path (Resolve-Path $ManifestPath).Path
$prResult = Invoke-QmGitHub -Arguments @('pr', 'view', $manifest.pr.ToString(), '--repo', $config.Repository, '--json', 'headRefOid,baseRefOid,url')
$pr = ConvertFrom-QmCommandJson $prResult "Read PR #$($manifest.pr)"
$validation = Test-QmEvidence -Manifest $manifest -CandidateHeadSha $pr.headRefOid -CurrentBaseSha $pr.baseRefOid
if (-not $validation.Valid) { throw "Evidence is incomplete or stale:`n$($validation.Errors -join "`n")" }
$body = ConvertTo-QmEvidenceMarkdown -Manifest $manifest
$issueComment = Publish-QmMarkedComment -Repository $config.Repository -Issue ([int]$manifest.issue) -Marker '<!-- quizymode-acceptance-evidence:v1 -->' -Body $body -DryRun:$DryRun
$prBody = "<!-- quizymode-evidence-link:v1 -->`nAcceptance evidence: $($issueComment.Url)"
$prComment = Publish-QmMarkedComment -Repository $config.Repository -Issue ([int]$manifest.pr) -Marker '<!-- quizymode-evidence-link:v1 -->' -Body $prBody -DryRun:$DryRun
[pscustomobject]@{ issueComment = $issueComment; prComment = $prComment; manifestHash = Get-QmEvidenceHash -Body (ConvertTo-QmJson $manifest) } | ConvertTo-Json -Depth 10
