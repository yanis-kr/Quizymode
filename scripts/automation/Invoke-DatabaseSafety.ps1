[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$CandidateSha,
    [Parameter(Mandatory = $true)][string]$Worktree,
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'automation.config.psd1')
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Quizymode.Automation.psm1') -Force

function Set-QmPgEnvironment {
    param([hashtable]$Values)
    $env:PGHOST = [string]$Values['host']
    $env:PGPORT = if ($Values.ContainsKey('port')) { [string]$Values['port'] } else { '5432' }
    $env:PGDATABASE = [string]$Values['database']
    $env:PGUSER = if ($Values.ContainsKey('username')) { [string]$Values['username'] } elseif ($Values.ContainsKey('user id')) { [string]$Values['user id'] } else { '' }
    $env:PGPASSWORD = [string]$Values['password']
    $sslMode = if ($Values.ContainsKey('ssl mode')) { [string]$Values['ssl mode'] } elseif ($Values.ContainsKey('sslmode')) { [string]$Values['sslmode'] } else { 'require' }
    $env:PGSSLMODE = $sslMode.ToLowerInvariant().Replace('verifyfull', 'verify-full').Replace('verifyca', 'verify-ca')
}

$required = @('pg_dump.exe','pg_restore.exe','createdb.exe','dropdb.exe','dotnet.exe')
foreach ($command in $required) {
    if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Database safety prerequisite is missing: $command" }
}
if ([string]::IsNullOrWhiteSpace($env:QM_AGENT_SUPADB_CS)) { throw 'QM_AGENT_SUPADB_CS is required for a destructive-migration backup.' }
foreach ($name in @('QM_AGENT_LOCAL_PGHOST','QM_AGENT_LOCAL_PGPORT','QM_AGENT_LOCAL_PGDATABASE','QM_AGENT_LOCAL_PGUSER','QM_AGENT_LOCAL_PGPASSWORD')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "$name is required for the isolated restore rehearsal." }
}

$config = Get-QmConfig -Path $ConfigPath
$backupDirectory = Join-Path $config.StateRoot "backups\$CandidateSha"
if (-not (Test-Path -LiteralPath $backupDirectory)) { New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null }
$stamp = (Get-QmUtcNow).ToString('yyyyMMddTHHmmssZ')
$backupPath = Join-Path $backupDirectory "production-$stamp.dump"
$manifestPath = Join-Path $backupDirectory "safety-$stamp.json"
$rehearsalDatabase = "qm_rehearsal_$($CandidateSha.Substring(0, 10))_$([Guid]::NewGuid().ToString('N').Substring(0, 8))"

$savedPg = @{}
foreach ($name in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE')) { $savedPg[$name] = [Environment]::GetEnvironmentVariable($name) }
$savedConnection = [Environment]::GetEnvironmentVariable('ConnectionStrings__quizymode')
$created = $false
try {
    $production = ConvertFrom-QmPgConnectionString -ConnectionString $env:QM_AGENT_SUPADB_CS
    Set-QmPgEnvironment -Values $production
    $dump = Invoke-QmNative -FilePath 'pg_dump.exe' -Arguments @('--format=custom','--no-owner','--no-acl','--file', $backupPath) -WorkingDirectory $Worktree -TimeoutSeconds 3600
    if ($dump.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $backupPath)) { throw "Production backup failed: $($dump.StdErr)" }

    $local = @{
        host = $env:QM_AGENT_LOCAL_PGHOST; port = $env:QM_AGENT_LOCAL_PGPORT; database = $env:QM_AGENT_LOCAL_PGDATABASE
        username = $env:QM_AGENT_LOCAL_PGUSER; password = $env:QM_AGENT_LOCAL_PGPASSWORD
        'ssl mode' = if ([string]::IsNullOrWhiteSpace($env:QM_AGENT_LOCAL_PGSSLMODE)) { 'disable' } else { $env:QM_AGENT_LOCAL_PGSSLMODE }
    }
    Set-QmPgEnvironment -Values $local
    $create = Invoke-QmNative -FilePath 'createdb.exe' -Arguments @($rehearsalDatabase) -WorkingDirectory $Worktree -TimeoutSeconds 120
    if ($create.ExitCode -ne 0) { throw "Create rehearsal database failed: $($create.StdErr)" }
    $created = $true
    $restore = Invoke-QmNative -FilePath 'pg_restore.exe' -Arguments @('--no-owner','--no-acl','--exit-on-error','--dbname', $rehearsalDatabase, $backupPath) -WorkingDirectory $Worktree -TimeoutSeconds 3600
    if ($restore.ExitCode -ne 0) { throw "Restore rehearsal failed: $($restore.StdErr)" }

    $localConnection = "Host=$($local.host);Port=$($local.port);Database=$rehearsalDatabase;Username=$($local.username);Password=$($local.password);SSL Mode=$($local.'ssl mode')"
    [Environment]::SetEnvironmentVariable('ConnectionStrings__quizymode', $localConnection)
    $migration = Invoke-QmNative -FilePath 'dotnet.exe' -Arguments @('ef','database','update','--project',$config.DatabaseSafety.MigrationProject,'--startup-project',$config.DatabaseSafety.StartupProject,'--no-build') -WorkingDirectory $Worktree -TimeoutSeconds 1800
    if ($migration.ExitCode -ne 0) { throw "Migration rehearsal failed: $($migration.StdErr)" }

    $manifest = [ordered]@{
        schemaVersion = 1; candidateSha = $CandidateSha; status = 'pass'; backupPath = $backupPath
        backupSha256 = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
        backupCreatedAt = (Get-QmUtcNow).ToString('o'); retentionDays = [int]$config.DatabaseSafety.BackupRetentionDays
        rehearsal = [ordered]@{ database = $rehearsalDatabase; restored = $true; migrationsApplied = $true; completedAt = (Get-QmUtcNow).ToString('o') }
    }
    Write-QmAtomicJson -Path $manifestPath -Value $manifest
    $manifest | Add-Member -NotePropertyName manifestPath -NotePropertyValue $manifestPath
    $manifest | ConvertTo-Json -Depth 10
}
finally {
    [Environment]::SetEnvironmentVariable('ConnectionStrings__quizymode', $savedConnection)
    if ($created) {
        Set-QmPgEnvironment -Values $local
        [void](Invoke-QmNative -FilePath 'dropdb.exe' -Arguments @('--if-exists', $rehearsalDatabase) -WorkingDirectory $Worktree -TimeoutSeconds 120)
    }
    foreach ($name in $savedPg.Keys) { [Environment]::SetEnvironmentVariable($name, $savedPg[$name]) }
}
