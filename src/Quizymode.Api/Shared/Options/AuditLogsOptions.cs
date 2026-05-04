namespace Quizymode.Api.Shared.Options;

internal sealed record class AuditLogsOptions
{
    public const string SectionName = "AuditLogs";

    public List<string> ExcludedEmails { get; init; } = [];
}
