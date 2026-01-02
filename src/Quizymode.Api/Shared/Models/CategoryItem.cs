namespace Quizymode.Api.Shared.Models;

public sealed class CategoryItem
{
    public Guid CategoryId { get; set; } // Part of composite PK
    public Guid ItemId { get; set; } // Part of composite PK
    public string CreatedBy { get; set; } = string.Empty; // User Id stored as string
    public DateTime CreatedAt { get; set; }
    
    public Category Category { get; set; } = null!;
    public Item Item { get; set; } = null!;
}

