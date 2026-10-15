[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$pester = @(Get-Module -ListAvailable Pester | Sort-Object Version -Descending | Select-Object -First 1)
if ($pester.Count -eq 0 -or $pester[0].Version -lt [Version]'3.4.0') { throw 'Pester 3.4.0 or later is required.' }
Import-Module Pester -MinimumVersion 3.4.0 -Force
$result = Invoke-Pester -Path (Join-Path $PSScriptRoot 'tests') -PassThru
if ($result.FailedCount -gt 0) { exit 1 }
