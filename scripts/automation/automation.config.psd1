@{
    SchemaVersion = 1
    DryRunByDefault = $false
    ReleaseEnabled = $true
    Repository = 'yanis-kr/Quizymode'
    BaseBranch = 'main'
    StateRoot = '%LOCALAPPDATA%\Quizymode\automation'
    WorktreeRoot = '%LOCALAPPDATA%\Quizymode\automation\worktrees'
    ArtifactRoot = '%LOCALAPPDATA%\Quizymode\automation\artifacts'
    LockStaleAfterMinutes = 180
    ControllerPollSeconds = 300
    MaxRepairAttempts = 2
    MaxActiveIssuesPerProvider = 1
    MaxSpecialistsPerOrchestrator = 2
    StageTimeoutMinutes = 45
    QuotaBackoffMinutes = 60
    RequiredChecks = @('build-test-publish', 'automation-contract')
    DeploymentWorkflows = @('Deploy')
    DeploymentWorkflowFile = 'deploy.yml'
    RollbackWorkflowFile = 'rollback.yml'
    DeploymentTimeoutMinutes = 90
    SmokeUrls = @('https://www.quizymode.com/')
    DatabaseSafety = @{
        BackupRetentionDays = 30
        MigrationProject = 'src\Quizymode.Api\Quizymode.Api.csproj'
        StartupProject = 'src\Quizymode.Api\Quizymode.Api.csproj'
    }
    ProtectedPolicyPaths = @(
        'scripts/automation/',
        '.codex/',
        '.github/workflows/',
        'docs/automation/workflow.md'
    )
    DestructiveMigrationPatterns = @(
        '(?i)\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b',
        '(?i)\bTRUNCATE\b',
        '(?i)\bDELETE\s+FROM\b(?!.*\bWHERE\b)'
    )
    Providers = @{
        codex = @{
            Enabled = $true
            Adapter = 'adapters\CodexAdapter.psm1'
            Queue = @(107, 108, 110, 109, 113, 111, 112)
            BranchPrefix = 'codex'
            ReadyPattern = '(?im)^\*\*Status:\*\*\s*Ready\b'
            OrchestratorModel = 'gpt-6.1-sol'
            OrchestratorEffort = 'medium'
            ArchitectModel = 'gpt-6.1-sol'
            ArchitectEffort = 'high'
            ReviewerModel = 'gpt-6.1-sol'
            ReviewerEffort = 'high'
            CoderModel = 'gpt-6.1-sol'
            CoderEffort = 'medium'
            UxModel = 'gpt-6.1-sol'
            UxEffort = 'medium'
            TesterModel = 'gpt-6.1-sol'
            TesterEffort = 'medium'
            ReporterModel = 'gpt-6-luna'
            ReporterEffort = 'medium'
        }
        claude = @{
            Enabled = $true
            Adapter = 'adapters\ClaudeAdapter.psm1'
            Queue = @(107, 108, 110, 109, 113, 111, 112)
            BranchPrefix = 'claude'
            ReadyPattern = '(?im)^\*\*Status:\*\*\s*Ready\b'
            OrchestratorModel = 'sonnet'
            OrchestratorEffort = 'medium'
            ArchitectModel = 'opus'
            ArchitectEffort = 'high'
            ReviewerModel = 'opus'
            ReviewerEffort = 'high'
            CoderModel = 'sonnet'
            CoderEffort = 'medium'
            UxModel = 'sonnet'
            UxEffort = 'medium'
            TesterModel = 'sonnet'
            TesterEffort = 'medium'
            ReporterModel = 'haiku'
            ReporterEffort = 'medium'
        }
    }
}
