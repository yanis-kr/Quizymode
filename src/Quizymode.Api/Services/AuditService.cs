using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

internal sealed class AuditService(
    ApplicationDbContext dbContext,
    IHttpContextAccessor httpContextAccessor,
    ILogger<AuditService> logger) : IAuditService
{
    public async Task LogAsync(
        AuditAction action,
        Guid? userId = null,
        Guid? entityId = null,
        Dictionary<string, string>? metadata = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            string ipAddress = RequestMetadataHelper.GetClientIpAddress(httpContextAccessor.HttpContext);

            Audit audit = new Audit
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                IpAddress = ipAddress,
                Action = action,
                EntityId = entityId,
                CreatedUtc = DateTime.UtcNow,
                Metadata = metadata ?? new Dictionary<string, string>()
            };

            dbContext.Audits.Add(audit);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            // Log error but don't fail the request
            logger.LogError(ex, "Failed to log audit entry for action {Action}", action);
        }
    }
}

