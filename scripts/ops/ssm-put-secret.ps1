<#
.SYNOPSIS
  Stores one secret in SSM Parameter Store without the value ever appearing in a command line, output or transcript.

.DESCRIPTION
  The value comes from -FromFile (a file you control; it is not deleted) or, when -FromFile is omitted, a hidden
  Read-Host -AsSecureString prompt that is staged in a private temp file for the one call and removed afterwards.
  The parameter is written as a SecureString (standard tier, default AWS-managed key) with --overwrite. Only the name
  and the new version are printed. Nothing is deleted. Names outside /quizymode/prod/ and /quizymode/deploy/ are refused.

.PARAMETER Name
  Full parameter name, for example /quizymode/prod/Gemini/ApiKey.

.PARAMETER FromFile
  Path of a file that holds exactly the value (a trailing newline is fine and is removed by the aws call as-is, so
  prefer a file without one).

.PARAMETER Region
  AWS region of the parameters. Default us-east-1.

.PARAMETER AwsCommand
  The aws executable. Tests point it at a stub.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$FromFile,
    [string]$Region = 'us-east-1',
    [string]$AwsCommand = 'aws'
)

$ErrorActionPreference = 'Stop'

$allowed = @('/quizymode/prod/', '/quizymode/deploy/')
$underAllowedPrefix = $false
foreach ($prefix in $allowed) {
    if ($Name.StartsWith($prefix, [System.StringComparison]::Ordinal) -and $Name.Length -gt $prefix.Length) { $underAllowedPrefix = $true }
}
if (-not $underAllowedPrefix -or $Name.Contains('..') -or $Name -match '\s') {
    Write-Error "Refused: the name must be under /quizymode/prod/ or /quizymode/deploy/ and contain no spaces or '..'."
    exit 2
}

$stagedFile = $null
try {
    if ($FromFile) {
        if (-not (Test-Path -LiteralPath $FromFile -PathType Leaf)) { Write-Error 'Refused: the -FromFile path does not exist.'; exit 3 }
        $sourceFile = (Resolve-Path -LiteralPath $FromFile).Path
    }
    else {
        $secure = Read-Host -Prompt "Value for $Name (hidden)" -AsSecureString
        $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $stagedFile = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($stagedFile, $plain, (New-Object System.Text.UTF8Encoding($false)))
        $plain = $null
        $sourceFile = $stagedFile
    }

    if ((Get-Item -LiteralPath $sourceFile).Length -eq 0) { Write-Error 'Refused: the value is empty.'; exit 4 }

    $uri = 'file://' + ($sourceFile -replace '\\', '/')
    # stderr is not shown: an AWS error can echo request details.
    $version = & $AwsCommand ssm put-parameter --name $Name --type SecureString --overwrite --region $Region `
        --value $uri --query Version --output text 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Error "put-parameter failed for $Name (details hidden on purpose)."; exit 5 }

    Write-Output "$Name version $version"
}
finally {
    if ($stagedFile -and (Test-Path -LiteralPath $stagedFile)) { Remove-Item -LiteralPath $stagedFile -Force }
}
