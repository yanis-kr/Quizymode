namespace Quizymode.Api.Shared.Models;

public sealed class Category
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty; // Preserves original case
    public int Depth { get; set; } // 1 = category, 2 = subcategory, 3+ possible
    public bool IsPrivate { get; set; }
    public string CreatedBy { get; set; } = string.Empty; // User Id stored as string
    public DateTime CreatedAt { get; set; }
    
    // Navigation properties
    public List<CategoryItem> CategoryItems { get; set; } = new();
}

