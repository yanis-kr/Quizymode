namespace Quizymode.Api.Shared.Models;

/// <summary>
/// Curated question picture (#407): a key resolved by the web build into a bundled image, plus its alt text.
/// </summary>
public sealed record ItemImageReference(string Key, string AltText);
