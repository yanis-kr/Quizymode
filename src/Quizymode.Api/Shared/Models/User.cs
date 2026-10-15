namespace Quizymode.Api.Shared.Models;

public sealed class User
{
    public Guid Id { get; set; }

    // Subject (sub) claim from identity provider - unique per user
    public string Subject { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? Name { get; set; }

    public DateTime LastLogin { get; set; } = DateTime.UtcNow;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Marks staff/test accounts whose traffic is excluded from analytics. Evaluated at query
    /// time as well as write time, so flagging a user retroactively hides their past sessions.
    /// </summary>
    public bool IsInternal { get; set; }
}
