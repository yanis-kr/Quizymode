[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# Pester 5 removed the legacy non-dashed `Should Be`/`Should Throw` syntax
# this whole suite uses (confirmed: it silently fails every test on
# windows-latest, which ships Pester 5.x by default). Pin to a <5 version
# instead of just "latest >= 3.4.0", which keeps picking 5.x whenever it's
# present.
$pester = @(Get-Module -ListAvailable Pester | Where-Object { $_.Version.Major -lt 5 } | Sort-Object Version -Descending | Select-Object -First 1)
if ($pester.Count -eq 0 -or $pester[0].Version -lt [Version]'3.4.0') { throw 'Pester 3.4.0-4.x is required (legacy Should syntax); Pester 5 removes it and must not be auto-selected.' }
Import-Module Pester -RequiredVersion $pester[0].Version -Force
$result = Invoke-Pester -Path (Join-Path $PSScriptRoot 'tests') -PassThru
if ($result.FailedCount -gt 0) { exit 1 }
