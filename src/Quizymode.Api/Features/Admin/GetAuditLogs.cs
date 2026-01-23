using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class GetAuditLogs
{
    public sealed record QueryRequest(
        List<AuditAction>? ActionTypes = null,
        int Page = 1,
        int PageSize = 50);

    public sealed record Response(
        List<AuditLogResponse> Logs,
        int TotalCount,
        int Page,
        int PageSize,
        int TotalPages);

    public sealed record AuditLogResponse(
        string Id,
        string? UserEmail,
        string IpAddress,
        string Action,
        string? EntityId,
        DateTime CreatedUtc,
        Dictionary<string, string> Metadata);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/audit-logs", Handler)
                .WithTags("Admin")
                .WithSummary("Get audit logs with filters (Admin only)")
                .WithDescription("Returns paginated audit logs with optional filtering by action types. Includes user email for logged-in users.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            string? actionTypes,
            int page = 1,
            int pageSize = 50,
            ApplicationDbContext db = null!,
            CancellationToken cancellationToken = default)
        {
            // Parse actionTypes from comma-separated string
            List<AuditAction>? parsedActionTypes = null;
            if (!string.IsNullOrWhiteSpace(actionTypes))
            {
                string[] actionTypeStrings = actionTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                List<AuditAction> actions = new();
                foreach (string actionTypeString in actionTypeStrings)
                {
                    if (Enum.TryParse<AuditAction>(actionTypeString, ignoreCase: true, out AuditAction action))
                    {
                        actions.Add(action);
                    }
                }
                if (actions.Count > 0)
                {
                    parsedActionTypes = actions;
                }
            }

            QueryRequest request = new(parsedActionTypes, page, pageSize);
            Result<Response> result = await HandleAsync(request, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            // Build base query
            IQueryable<Audit> query = db.Audits.AsQueryable();

            // Apply action type filter if provided
            if (request.ActionTypes is not null && request.ActionTypes.Count > 0)
            {
                query = query.Where(a => request.ActionTypes.Contains(a.Action));
            }

            // Get total count before pagination
            int totalCount = await query.CountAsync(cancellationToken);

            // Apply pagination
            int page = Math.Max(1, request.Page);
            int pageSize = Math.Clamp(request.PageSize, 1, 100);
            int skip = (page - 1) * pageSize;
            int totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            // Get paginated results
            List<Audit> audits = await query
                .OrderByDescending(a => a.CreatedUtc)
                .Skip(skip)
                .Take(pageSize)
                .ToListAsync(cancellationToken);

            // Get user emails for audits with UserId
            List<Guid> userIds = audits
                .Where(a => a.UserId.HasValue)
                .Select(a => a.UserId!.Value)
                .Distinct()
                .ToList();

            Dictionary<Guid, string?> userEmails = new();
            if (userIds.Count > 0)
            {
                userEmails = await db.Users
                    .Where(u => userIds.Contains(u.Id))
                    .Select(u => new { u.Id, u.Email })
                    .ToDictionaryAsync(u => u.Id, u => u.Email, cancellationToken);
            }

            // Map to response
            List<AuditLogResponse> logs = audits.Select(a => new AuditLogResponse(
                a.Id.ToString(),
                a.UserId.HasValue && userEmails.TryGetValue(a.UserId.Value, out string? email) ? email : null,
                a.IpAddress,
                a.Action.ToString(),
                a.EntityId?.ToString(),
                a.CreatedUtc,
                a.Metadata)).ToList();

            return Result.Success(new Response(logs, totalCount, page, pageSize, totalPages));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Admin.GetAuditLogsFailed", $"Failed to retrieve audit logs: {ex.Message}"));
        }
    }
}

