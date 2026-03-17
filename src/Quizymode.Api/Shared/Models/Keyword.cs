namespace Quizymode.Api.Shared.Models;

public sealed class Keyword
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty; // Max 30 characters

    /// <summary>URL-friendly segment. When null, slug is derived from Name. Admin can update Name and Slug independently.</summary>
    public string? Slug { get; set; }

    public bool IsPrivate { get; set; } // Global (false) or Private (true)

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

