using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

public static class GetDatabaseSize
{
    private sealed record DatabaseSizeResult(long SizeBytes);

    public sealed record Response(
        long SizeBytes,
        double SizeMegabytes,
        double SizeGigabytes,
        double FreeTierLimitMegabytes,
        double UsagePercentage);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/database/size", Handler)
                .WithTags("Admin")
                .WithSummary("Get current database size (Admin only)")
                .WithDescription("Returns the current PostgreSQL database size and usage percentage relative to the 500MB free tier limit")
                .RequireAuthorization("Admin")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            // Query PostgreSQL to get database size
            // pg_database_size returns size in bytes
            // Use current_database() to get the current database name
            string sql = "SELECT pg_database_size(current_database())";

            // Use the connection directly to execute a scalar query
            long sizeBytes = 0;
            var connection = db.Database.GetDbConnection();
            if (connection.State != System.Data.ConnectionState.Open)
            {
                await db.Database.OpenConnectionAsync(cancellationToken);
            }

            await using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                object? scalarResult = await command.ExecuteScalarAsync(cancellationToken);
                if (scalarResult is not null)
                {
                    sizeBytes = Convert.ToInt64(scalarResult);
                }
            }
            const double freeTierLimitMegabytes = 500.0;
            double sizeMegabytes = sizeBytes / (1024.0 * 1024.0);
            double sizeGigabytes = sizeBytes / (1024.0 * 1024.0 * 1024.0);
            double usagePercentage = (sizeMegabytes / freeTierLimitMegabytes) * 100.0;

            return Result.Success(new Response(
                sizeBytes,
                sizeMegabytes,
                sizeGigabytes,
                freeTierLimitMegabytes,
                usagePercentage));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Admin.GetDatabaseSizeFailed", $"Failed to retrieve database size: {ex.Message}"));
        }
    }
}

