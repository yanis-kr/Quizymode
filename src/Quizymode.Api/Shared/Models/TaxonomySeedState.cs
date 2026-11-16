namespace Quizymode.Api.Shared.Models;

/// <summary>
/// One-row table (Id is always 1) holding the SHA-256 of the taxonomy seed SQL that was last applied, so an unchanged
/// seed file is not replayed on every boot (#732).
/// </summary>
public sealed class TaxonomySeedState
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;

    /// <summary>Lowercase hex SHA-256 of the seed SQL file bytes.</summary>
    public string Sha256 { get; set; } = string.Empty;

    public DateTime AppliedUtc { get; set; }
}
