using Dapper;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

public static class GetDatabaseSize
{
    private sealed record ContentCountResult(long ItemCount, long KeywordCount);

    private sealed record DatabaseSizeResult(long SizeBytes);

    private sealed record TableSizeResult(string TableName, long SizeBytes);

    public sealed record TableSizeResponse(
        string TableName,
        long SizeBytes,
        double SizeMegabytes,
        double SizeGigabytes);

    public sealed record Response(
        long SizeBytes,
        double SizeMegabytes,
        double SizeGigabytes,
        double FreeTierLimitMegabytes,
        double UsagePercentage,
        long ItemCount,
        long KeywordCount,
        IReadOnlyList<TableSizeResponse> TopTables);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/database/size", Handler)
                .WithTags("Admin")
                .WithSummary("Get current database size (Admin only)")
                .WithDescription("Returns the current PostgreSQL database size, item and keyword totals, and the largest tables relative to the 500MB free tier limit")
                .RequireAuthorization("Admin")
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
            var connection = db.Database.GetDbConnection();
            if (connection.State != System.Data.ConnectionState.Open)
            {
                await db.Database.OpenConnectionAsync(cancellationToken);
            }

            const double freeTierLimitMegabytes = 500.0;

            ContentCountResult counts = await connection.QuerySingleAsync<ContentCountResult>(
                new CommandDefinition(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM "Items") AS "ItemCount",
                        (SELECT COUNT(*) FROM "Keywords") AS "KeywordCount"
                    """,
                    cancellationToken: cancellationToken));

            DatabaseSizeResult databaseSize = await connection.QuerySingleAsync<DatabaseSizeResult>(
                new CommandDefinition(
                    """
                    SELECT pg_database_size(current_database()) AS "SizeBytes"
                    """,
                    cancellationToken: cancellationToken));

            List<TableSizeResult> topTables = (await connection.QueryAsync<TableSizeResult>(
                new CommandDefinition(
                    """
                    SELECT
                        stat.relname AS "TableName",
                        pg_total_relation_size(stat.relid) AS "SizeBytes"
                    FROM pg_stat_user_tables stat
                    WHERE stat.schemaname = current_schema()
                    ORDER BY pg_total_relation_size(stat.relid) DESC, stat.relname ASC
                    LIMIT 5
                    """,
                    cancellationToken: cancellationToken))).ToList();

            long sizeBytes = databaseSize.SizeBytes;
            double sizeMegabytes = sizeBytes / (1024.0 * 1024.0);
            double sizeGigabytes = sizeBytes / (1024.0 * 1024.0 * 1024.0);
            double usagePercentage = (sizeMegabytes / freeTierLimitMegabytes) * 100.0;
            List<TableSizeResponse> topTableResponses = topTables
                .Select(table => new TableSizeResponse(
                    table.TableName,
                    table.SizeBytes,
                    table.SizeBytes / (1024.0 * 1024.0),
                    table.SizeBytes / (1024.0 * 1024.0 * 1024.0)))
                .ToList();

            return Result.Success(new Response(
                sizeBytes,
                sizeMegabytes,
                sizeGigabytes,
                freeTierLimitMegabytes,
                usagePercentage,
                counts.ItemCount,
                counts.KeywordCount,
                topTableResponses));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Admin.GetDatabaseSizeFailed", $"Failed to retrieve database size: {ex.Message}"));
        }
    }
}

