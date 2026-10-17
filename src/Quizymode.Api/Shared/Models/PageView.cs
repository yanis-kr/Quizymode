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

    /// <summary>
    /// Feature area from <c>PageHitClassifier</c> (home, browse, quiz, flashcards, ...; ANALYTICS-004).
    /// Null only for historical rows not yet reached by the classification backfill.
    /// </summary>
    public string? Area { get; set; }

    /// <summary>category, collection, item, or null.</summary>
    public string? ScopeType { get; set; }

    /// <summary>Category slug, collection id, or item id; at most 200 characters.</summary>
    public string? ScopeKey { get; set; }

    /// <summary>Category plus up to two navigation keywords, e.g. <c>geography/capitals</c>.</summary>
    public string? NavPath { get; set; }

    /// <summary>True when a Quiz or Flashcards path contains <c>/item/&lt;id&gt;</c> (one question viewed).</summary>
    public bool IsItemStep { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
