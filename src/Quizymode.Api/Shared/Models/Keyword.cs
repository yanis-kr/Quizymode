namespace Quizymode.Api.Shared.Models;

public sealed class Keyword
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty; // Max 10 characters

    public bool IsPrivate { get; set; } // Global (false) or Private (true)

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

