using System.ComponentModel.DataAnnotations;

namespace Quizymode.Api.Shared.Models;

public sealed class Collection
{
    public Guid Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Description { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string CategoryId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string SubcategoryId { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Visibility { get; set; } = "global"; // "global" | "private"

    [Required]
    [MaxLength(100)]
    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public int ItemCount { get; set; } = 0;
}

