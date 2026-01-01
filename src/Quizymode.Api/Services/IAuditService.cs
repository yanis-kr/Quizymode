using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

public interface IAuditService
{
    Task LogAsync(
        AuditAction action,
        Guid? userId = null,
        Guid? entityId = null,
        Dictionary<string, string>? metadata = null,
        CancellationToken cancellationToken = default);
}

