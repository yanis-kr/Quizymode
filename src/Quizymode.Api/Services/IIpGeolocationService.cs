namespace Quizymode.Api.Services;

public interface IIpGeolocationService
{
    /// <summary>
    /// Returns a country code (e.g. "US", "PL") for the given IP address,
    /// "Local" for loopback/private addresses, or null when unknown.
    /// Results are cached in-process for the application lifetime.
    /// </summary>
    Task<string?> GetCountryAsync(string ipAddress, CancellationToken cancellationToken = default);
}
