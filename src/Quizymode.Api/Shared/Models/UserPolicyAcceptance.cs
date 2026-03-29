namespace Quizymode.Api.Shared.Models;

/// <summary>
/// Represents an auditable record of a user accepting a specific policy version.
/// </summary>
public sealed class UserPolicyAcceptance
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public string PolicyType { get; set; } = string.Empty;

    public string PolicyVersion { get; set; } = string.Empty;

    public DateTime AcceptedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;

    public string IpAddress { get; set; } = "unknown";

    public string? UserAgent { get; set; }
}
