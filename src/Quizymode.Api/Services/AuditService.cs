using Microsoft.EntityFrameworkCore;
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
            string ipAddress = GetClientIpAddress();

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

    private string GetClientIpAddress()
    {
        HttpContext? httpContext = httpContextAccessor.HttpContext;
        if (httpContext is null)
        {
            return "unknown";
        }

        // Check for forwarded IP first (if behind proxy/load balancer)
        string? forwardedFor = httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedFor))
        {
            // X-Forwarded-For can contain multiple IPs, take the first one
            string[] ips = forwardedFor.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (ips.Length > 0)
            {
                return ips[0];
            }
        }

        // Check X-Real-IP header
        string? realIp = httpContext.Request.Headers["X-Real-IP"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(realIp))
        {
            return realIp;
        }

        // Fallback to connection remote IP
        return httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}

