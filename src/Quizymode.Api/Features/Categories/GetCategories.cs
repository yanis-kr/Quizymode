using Dapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.Categories;

public static class GetCategories
{
    public sealed record QueryRequest(string? Search);

    public sealed record CategoryResponse(
        Guid Id,
        string Category,
        int Count,
        bool IsPrivate,
        double? AverageStars);

    // Intermediate class for Dapper mapping
    private sealed class CategoryRow
    {
        public Guid Id { get; set; }
        public string Category { get; set; } = string.Empty;
        public int Count { get; set; }
        public bool IsPrivate { get; set; }
        public double? AverageStars { get; set; }
    }

    public sealed record Response(List<CategoryResponse> Categories);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("categories", Handler)
                .WithTags("Categories")
                .WithSummary("Get unique categories")
                .WithDescription("Returns unique categories with item counts and average stars, sorted by highest average rating first, then by name. Results are cached.")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            string? search,
            ApplicationDbContext db,
            IUserContext userContext,
            IMemoryCache cache,
            IOptions<CategoryOptions> categoryOptions,
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(search);

            Result<Response> result = await HandleAsync(request, db, userContext, cache, categoryOptions, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        IMemoryCache cache,
        IOptions<CategoryOptions> categoryOptions,
        CancellationToken cancellationToken)
    {
        try
        {
            // Build cache key including user context for visibility
            string userId = userContext.UserId ?? "anonymous";
            string cacheKey = $"categories:v2:{userId}:{request.Search ?? "all"}";
            int cacheTtlMinutes = categoryOptions.Value.CategoriesCacheTtlMinutes;

            // Try cache first
            if (cache.TryGetValue(cacheKey, out Response? cachedResponse) && cachedResponse is not null)
            {
                return Result.Success(cachedResponse);
            }

            // Get database connection
            System.Data.Common.DbConnection connection = db.Database.GetDbConnection();
            if (connection.State != System.Data.ConnectionState.Open)
            {
                await db.Database.OpenConnectionAsync(cancellationToken);
            }

            // Build simplified SQL query
            string currentUserId = userContext.UserId ?? "";
            bool isAuthenticated = userContext.IsAuthenticated && !string.IsNullOrEmpty(currentUserId);
            string? searchPattern = string.IsNullOrWhiteSpace(request.Search) 
                ? null 
                : $"%{request.Search.Trim()}%";
            
            string sql = @"
                SELECT
                    c.""Id"",
                    c.""Name"" AS ""Category"",
                    COUNT(DISTINCT i.""Id"")::int AS ""Count"",
                    c.""IsPrivate"",
                    CASE 
                        WHEN AVG(r.""Stars"") IS NOT NULL THEN ROUND(AVG(r.""Stars"")::numeric, 2)::double precision
                        ELSE NULL
                    END AS ""AverageStars""
                FROM ""items"" i
                INNER JOIN ""Categories"" c
                    ON c.""Id"" = i.""CategoryId""
                LEFT JOIN ""Ratings"" r
                    ON r.""ItemId"" = i.""Id""
                    AND r.""Stars"" IS NOT NULL
                WHERE i.""CategoryId"" IS NOT NULL
                    AND (
                        (@IsAuthenticated = false AND c.""IsPrivate"" = false AND i.""IsPrivate"" = false)
                        OR (@IsAuthenticated = true AND (
                            (c.""IsPrivate"" = false OR (c.""IsPrivate"" = true AND c.""CreatedBy"" = @CurrentUserId))
                            AND (i.""IsPrivate"" = false OR (i.""IsPrivate"" = true AND i.""CreatedBy"" = @CurrentUserId))
                        ))
                    )
                    AND (@SearchPattern IS NULL OR LOWER(c.""Name"") LIKE LOWER(@SearchPattern))
                GROUP BY c.""Id"", c.""Name"", c.""IsPrivate""
                ORDER BY
                    COALESCE(AVG(r.""Stars""), -1) DESC,
                    c.""Name"" ASC";

            var parameters = new
            {
                IsAuthenticated = isAuthenticated,
                CurrentUserId = currentUserId,
                SearchPattern = searchPattern
            };

            // Use an intermediate class for Dapper mapping, then convert to record
            List<CategoryResponse> categoryResponses = (await connection.QueryAsync<CategoryRow>(
                new CommandDefinition(
                    sql,
                    parameters,
                    cancellationToken: cancellationToken)))
                .Select(row => new CategoryResponse(
                    row.Id,
                    row.Category,
                    row.Count,
                    row.IsPrivate,
                    row.AverageStars))
                .ToList();

            Response response = new(categoryResponses);

            // Cache the result
            MemoryCacheEntryOptions cacheOptions = new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(cacheTtlMinutes)
            };
            cache.Set(cacheKey, response, cacheOptions);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Categories.GetFailed", $"Failed to get categories: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature.
        }
    }
}
