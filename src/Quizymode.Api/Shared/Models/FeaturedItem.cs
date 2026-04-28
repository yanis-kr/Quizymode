namespace Quizymode.Api.Shared.Models;

public enum FeaturedItemType
{
    Set = 0,
    Collection = 1,
}

public sealed class FeaturedItem
{
    public Guid Id { get; set; }

    public FeaturedItemType Type { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    // Set fields
    public string? CategorySlug { get; set; }
    public string? NavKeyword1 { get; set; }
    public string? NavKeyword2 { get; set; }

    // Collection fields
    public Guid? CollectionId { get; set; }
    public Collection? Collection { get; set; }

    public int SortOrder { get; set; }

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
