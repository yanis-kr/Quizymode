Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$webPath = Join-Path $PSScriptRoot "src\Quizymode.Web"

if (-not (Test-Path $webPath)) {
    throw "Web app directory not found: $webPath"
}

Set-Location $webPath
npm run dev
