<#
.SYNOPSIS
  Lists parameter names, types and versions under a prefix. Never shows or decrypts a value.

.PARAMETER Path
  Prefix to list. Default /quizymode/. Must start with /quizymode/.

.PARAMETER Region
  AWS region. Default us-east-1.

.PARAMETER AwsCommand
  The aws executable. Tests point it at a stub.
#>
[CmdletBinding()]
param(
    [string]$Path = '/quizymode/',
    [string]$Region = 'us-east-1',
    [string]$AwsCommand = 'aws'
)

$ErrorActionPreference = 'Stop'

if (-not $Path.StartsWith('/quizymode/', [System.StringComparison]::Ordinal) -or $Path.Contains('..')) {
    Write-Error 'Refused: the path must start with /quizymode/.'
    exit 2
}

# No decryption flag, and the query keeps only Name, Type and Version, so no value column can appear.
$rows = & $AwsCommand ssm get-parameters-by-path --path $Path --recursive --region $Region `
    --query 'Parameters[].[Name,Type,Version]' --output text 2>$null
if ($LASTEXITCODE -ne 0) { Write-Error 'get-parameters-by-path failed (details hidden on purpose).'; exit 5 }

Write-Output "Name`tType`tVersion"
$rows | ForEach-Object { Write-Output $_ }
