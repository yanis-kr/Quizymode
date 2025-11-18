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
}
