namespace Quizymode.Api.Shared.Models;

public sealed class Request
{
    public Guid Id { get; set; }

    public string CategoryId { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public string Status { get; set; } = "Pending";
}


