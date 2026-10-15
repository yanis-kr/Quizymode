Set-StrictMode -Version 2.0

function Get-QmProviderContract {
    return [pscustomobject]@{
        Name = 'claude'
        ContractVersion = 1
        Supports = @('architecture', 'ux', 'plan-review', 'implementation', 'testing', 'final-review', 'evidence')
        Authentication = 'Existing Claude subscription login only; never use --bare or API-key fallback'
    }
}

function Invoke-QmProviderStage {
    throw 'Claude adapter is intentionally contract-only in the bootstrap. Claude owns its implementation. See docs/automation/workflow.md#claude-adapter-contract.'
}

Export-ModuleMember -Function Get-QmProviderContract, Invoke-QmProviderStage
