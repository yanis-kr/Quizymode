namespace Quizymode.Api.Shared.Models;

/// <summary>
/// One front-end error reported by the SPA (OBS-001). Fields are bounded and sanitized on write:
/// query strings, fragments, emails, and bearer/JWT tokens are removed from every text field.
/// </summary>
public sealed class ClientError
{
    public const int MaxMessageLength = 500;
    public const int MaxErrorNameLength = 100;
    public const int MaxStackLength = 4000;
    public const int MaxComponentStackLength = 2000;
    public const int MaxPathLength = 512;

    public Guid Id { get; set; }

    /// <summary>Hash of the error name, normalized message, and normalized top stack frame.</summary>
    public string Fingerprint { get; set; } = string.Empty;

    /// <summary><c>boundary</c>, <c>window</c>, or <c>promise</c>.</summary>
    public string Source { get; set; } = string.Empty;

    public string ErrorName { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string? Stack { get; set; }

    public string? ComponentStack { get; set; }

    /// <summary>App-relative path without the query string or fragment.</summary>
    public string Path { get; set; } = string.Empty;

    public string? AppVersion { get; set; }

    /// <summary>The same tab-scoped id the page-view tracker sends, so errors join to the session journey.</summary>
    public string SessionId { get; set; } = string.Empty;

    /// <summary>Reserved for the persistent visitor id (ANALYTICS-003).</summary>
    public string? VisitorId { get; set; }

    public Guid? UserId { get; set; }

    public bool IsAuthenticated { get; set; }

    public string? UserAgent { get; set; }

    /// <summary><c>desktop</c>, <c>mobile</c>, <c>tablet</c>, or <c>unknown</c>, derived from the user agent.</summary>
    public string DeviceClass { get; set; } = string.Empty;

    public bool IsBot { get; set; }

    /// <summary>Set at write time for admins, users flagged internal, and browsers sending the internal marker.</summary>
    public bool IsInternal { get; set; }

    /// <summary>Assigned by the server; client clocks are not trusted.</summary>
    public DateTime OccurredUtc { get; set; } = DateTime.UtcNow;
}
