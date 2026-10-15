namespace Quizymode.Api.Shared.Models;

public sealed class PageView
{
    public Guid Id { get; set; }

    public Guid? UserId { get; set; }

    public bool IsAuthenticated { get; set; }

    public string SessionId { get; set; } = string.Empty;

    public string IpAddress { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;

    public string QueryString { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    public string? UserAgent { get; set; }

    public bool IsBot { get; set; }

    /// <summary>
    /// True when the hit came from an admin, a user flagged internal, or a browser carrying the
    /// internal-browser marker. Reports exclude any session containing an internal hit.
    /// </summary>
    public bool IsInternal { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
