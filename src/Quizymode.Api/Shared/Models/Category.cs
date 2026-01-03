namespace Quizymode.Api.Shared.Models;

public sealed class Category
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty; // Preserves original case
    public bool IsPrivate { get; set; }
    public string CreatedBy { get; set; } = string.Empty; // User Id stored as string
    public DateTime CreatedAt { get; set; }
    
    // Navigation properties
    public List<Item> Items { get; set; } = new();
}

