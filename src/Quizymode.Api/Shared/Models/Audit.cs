namespace Quizymode.Api.Shared.Models;

public sealed class Audit
{
    public Guid Id { get; set; }

    public Guid? UserId { get; set; }

    public string IpAddress { get; set; } = string.Empty;

    public AuditAction Action { get; set; }

    public Guid? EntityId { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    // JSONB column - stored as Dictionary<string, string> for minimal size
    public Dictionary<string, string> Metadata { get; set; } = new();
}

