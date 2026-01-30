using Dapper;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Microsoft.Extensions.Logging;

namespace Quizymode.Api.Features.Keywords;

/// <summary>
/// Feature for retrieving navigation keywords with aggregates.
/// Returns the next navigation layer based on current selection (category + selected keywords).
/// Rank 1 keywords are first-level navigation under a category.
/// Rank 2 keywords are children of a rank-1 keyword (via ParentName).
/// </summary>
public static class GetKeywords
{
    /// <summary>
    /// Request DTO for keyword navigation query.
    /// Category: Required category name.
    /// SelectedKeywords: List of currently selected keywords (for determining next navigation layer).
    /// </summary>
    public sealed record QueryRequest(
        string Category,
        List<string>? SelectedKeywords);

    /// <summary>
    /// Response DTO for a navigation keyword with aggregates.
    /// </summary>
    public sealed record KeywordResponse(
        string Name,
        int ItemCount,
        double? AverageRating,
        int NavigationRank);

    public sealed record Response(List<KeywordResponse> Keywords);

    // Intermediate class for Dapper mapping
    private sealed class KeywordRow
    {
        public string Name { get; set; } = string.Empty;
        public int ItemCount { get; set; }
        public double? AverageRating { get; set; }
        public int NavigationRank { get; set; }
        public int SortRank { get; set; }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("keywords", Handler)
                .WithTags("Keywords")
                .WithSummary("Get navigation keywords with aggregates")
                .WithDescription("Returns the next navigation layer (rank-1 or rank-2 keywords) based on current selection. Includes item counts and average ratings.")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string category,
            string? selectedKeywords,
            ApplicationDbContext db,
            IUserContext userContext,
            ILogger<Endpoint> logger,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(category))
            {
                return CustomResults.BadRequest("Category is required");
            }

            List<string>? keywordList = null;
            if (!string.IsNullOrEmpty(selectedKeywords))
            {
                keywordList = selectedKeywords.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Where(k => !string.IsNullOrWhiteSpace(k))
                    .ToList();
            }

            QueryRequest request = new(category.Trim(), keywordList);

            Result<Response> result = await HandleAsync(request, db, userContext, logger, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        ILogger<Endpoint> logger,
        CancellationToken cancellationToken)
    {
        try
        {
            // Validate navigation path
            Result pathValidationResult = await NavigationPathValidator.ValidatePathAsync(
                request.Category,
                request.SelectedKeywords,
                db,
                userContext,
                cancellationToken);

            if (pathValidationResult.IsFailure)
            {
                return Result.Failure<Response>(pathValidationResult.Error!);
            }

            // Resolve category
            string categoryName = request.Category.Trim();
            Guid? categoryId = await ResolveCategoryIdAsync(categoryName, db, userContext, cancellationToken);

            if (!categoryId.HasValue)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Keywords.CategoryNotFound", $"Category '{categoryName}' not found"));
            }

            // Determine navigation layer to return
            int? targetRank = await DetermineTargetRankAsync(request.SelectedKeywords, db, categoryId.Value, cancellationToken);
            
            if (!targetRank.HasValue)
            {
                // No more navigation layers (e.g., rank-2 already selected)
                logger.LogInformation(
                    "Keywords retrieved. Category: {Category}, SelectedKeywords: {SelectedKeywords}, KeywordCount: 0, TotalItemCount: 0 (no more navigation layers)",
                    request.Category,
                    request.SelectedKeywords != null ? string.Join(",", request.SelectedKeywords) : "(none)");
                return Result.Success(new Response(new List<KeywordResponse>()));
            }

            // Get navigation keywords for the target rank
            List<KeywordResponse> keywords = await GetNavigationKeywordsAsync(
                categoryId.Value,
                targetRank.Value,
                request.SelectedKeywords,
                db,
                userContext,
                cancellationToken);

            // Add "other" keyword for rank-1 if applicable (SortRank=0, should appear first)
            if (targetRank == 1)
            {
                int otherItemCount = await GetOtherItemCountAsync(
                    categoryId.Value,
                    db,
                    userContext,
                    cancellationToken);

                if (otherItemCount > 0)
                {
                    keywords.Insert(0, new KeywordResponse(
                        Name: "other",
                        ItemCount: otherItemCount,
                        AverageRating: null, // Could calculate if needed
                        NavigationRank: 1));
                }
            }

            // Keywords are already ordered by SortRank from SQL query
            Response response = new(keywords);
            int totalItemCount = keywords.Sum(k => k.ItemCount);

            logger.LogInformation(
                "Keywords retrieved. Category: {Category}, SelectedKeywords: {SelectedKeywords}, KeywordCount: {KeywordCount}, TotalItemCount: {TotalItemCount}",
                request.Category,
                request.SelectedKeywords != null ? string.Join(",", request.SelectedKeywords) : "(none)",
                keywords.Count,
                totalItemCount);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to get keywords. Category: {Category}, UserId: {UserId}",
                request.Category, userContext.UserId);
            return Result.Failure<Response>(
                Error.Problem("Keywords.GetFailed", $"Failed to get keywords: {ex.Message}"));
        }
    }

    /// <summary>
    /// Determines which navigation rank to return based on current selection.
    /// Returns 1 if no keywords selected (show rank-1), 2 if rank-1 selected (show rank-2), null if rank-2 selected.
    /// </summary>
    private static async Task<int?> DetermineTargetRankAsync(
        List<string>? selectedKeywords,
        ApplicationDbContext db,
        Guid categoryId,
        CancellationToken cancellationToken)
    {
        if (selectedKeywords is null || selectedKeywords.Count == 0)
        {
            return 1; // Show rank-1 keywords
        }

        // Check if any selected keyword is a rank-1 navigation keyword
        List<string> normalizedKeywords = selectedKeywords
            .Select(k => k.Trim().ToLower())
            .ToList();

        bool hasRank1Keyword = await db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId
                && ck.NavigationRank == 1
                && normalizedKeywords.Contains(ck.Keyword.Name.ToLower()))
            .AnyAsync(cancellationToken);

        if (!hasRank1Keyword)
        {
            // Rank-2 or non-navigation keywords selected - no more navigation layers
            return null;
        }

        // If we have 2+ keywords, we may already have rank-2 selected - no more layers
        if (normalizedKeywords.Count >= 2)
        {
            string rank1Name = normalizedKeywords[0];
            string potentialRank2 = normalizedKeywords[1];
            bool hasRank2UnderRank1 = await db.CategoryKeywords
                .Where(ck => ck.CategoryId == categoryId
                    && ck.NavigationRank == 2
                    && ck.ParentName != null
                    && ck.ParentName.ToLower() == rank1Name
                    && ck.Keyword.Name.ToLower() == potentialRank2)
                .AnyAsync(cancellationToken);
            if (hasRank2UnderRank1)
            {
                return null; // Rank-2 already selected, no more navigation layers
            }
        }

        return 2; // Show rank-2 keywords under the selected rank-1 parent
    }

    /// <summary>
    /// Gets navigation keywords for the specified rank with aggregates.
    /// </summary>
    private static async Task<List<KeywordResponse>> GetNavigationKeywordsAsync(
        Guid categoryId,
        int targetRank,
        List<string>? selectedKeywords,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        System.Data.Common.DbConnection connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await db.Database.OpenConnectionAsync(cancellationToken);
        }

        string? currentUserId = userContext.UserId;
        bool isAuthenticated = userContext.IsAuthenticated && !string.IsNullOrEmpty(currentUserId);
        string safeCurrentUserId = currentUserId ?? string.Empty;
        int isAuthenticatedInt = isAuthenticated ? 1 : 0;

        // Build WHERE clause for parent filter (for rank-2)
        string? parentName = null;
        if (targetRank == 2 && selectedKeywords is not null && selectedKeywords.Count > 0)
        {
            // Find the rank-1 keyword from selected keywords
            List<string> normalizedSelected = selectedKeywords
                .Select(k => k.Trim().ToLower())
                .ToList();
            string? rank1Keyword = await db.CategoryKeywords
                .Where(ck => ck.CategoryId == categoryId
                    && ck.NavigationRank == 1
                    && normalizedSelected.Contains(ck.Keyword.Name.ToLower()))
                .Select(ck => ck.Keyword.Name)
                .FirstOrDefaultAsync(cancellationToken);

            parentName = rank1Keyword?.ToLower();
        }

        string sql = @"
            SELECT
                k.""Name"",
                COUNT(DISTINCT CASE 
                    WHEN i.""Id"" IS NOT NULL 
                        AND ((@IsAuthenticated = 0 AND c.""IsPrivate"" = false AND i.""IsPrivate"" = false)
                             OR (@IsAuthenticated = 1 AND (
                                 (c.""IsPrivate"" = false OR (c.""IsPrivate"" = true AND c.""CreatedBy"" = @CurrentUserId))
                                 AND (i.""IsPrivate"" = false OR (i.""IsPrivate"" = true AND i.""CreatedBy"" = @CurrentUserId))
                             )))
                    THEN i.""Id""
                    ELSE NULL
                END)::int AS ""ItemCount"",
                CASE 
                    WHEN COUNT(DISTINCT i.""Id"") > 0 THEN
                        ROUND(AVG(CASE 
                            WHEN r.""Stars"" IS NOT NULL 
                                AND ((@IsAuthenticated = 0 AND c.""IsPrivate"" = false AND i.""IsPrivate"" = false)
                                     OR (@IsAuthenticated = 1 AND (
                                         (c.""IsPrivate"" = false OR (c.""IsPrivate"" = true AND c.""CreatedBy"" = @CurrentUserId))
                                         AND (i.""IsPrivate"" = false OR (i.""IsPrivate"" = true AND i.""CreatedBy"" = @CurrentUserId))
                                     )))
                            THEN r.""Stars""::numeric
                            ELSE NULL
                        END), 2)::double precision
                    ELSE NULL
                END AS ""AverageRating"",
                ck.""NavigationRank""::int AS ""NavigationRank"",
                ck.""SortRank""::int AS ""SortRank""
            FROM ""CategoryKeywords"" ck
            INNER JOIN ""Keywords"" k ON k.""Id"" = ck.""KeywordId""
            LEFT JOIN ""ItemKeywords"" ik ON ik.""KeywordId"" = k.""Id""
            LEFT JOIN ""Items"" i ON i.""Id"" = ik.""ItemId""
            LEFT JOIN ""Categories"" c ON c.""Id"" = i.""CategoryId""
            LEFT JOIN ""Ratings"" r ON r.""ItemId"" = i.""Id"" AND r.""Stars"" IS NOT NULL
            WHERE ck.""CategoryId"" = @CategoryId
                AND ck.""NavigationRank"" = @TargetRank
                AND (
                    (@IsAuthenticated = 0 AND k.""IsPrivate"" = false)
                    OR (@IsAuthenticated = 1 AND (k.""IsPrivate"" = false OR (k.""IsPrivate"" = true AND k.""CreatedBy"" = @CurrentUserId)))
                )
                AND (@ParentName IS NULL OR LOWER(ck.""ParentName"") = @ParentName)
            GROUP BY k.""Name"", ck.""NavigationRank"", ck.""SortRank""
            ORDER BY ck.""SortRank"" ASC, k.""Name"" ASC";

        DynamicParameters parameters = new DynamicParameters();
        parameters.Add("CategoryId", categoryId);
        parameters.Add("TargetRank", targetRank);
        parameters.Add("IsAuthenticated", isAuthenticatedInt);
        parameters.Add("CurrentUserId", safeCurrentUserId);
        parameters.Add("ParentName", parentName, System.Data.DbType.String);

        List<KeywordResponse> keywords = (await connection.QueryAsync<KeywordRow>(
            new CommandDefinition(
                sql,
                parameters,
                cancellationToken: cancellationToken)))
            .Select(row => new KeywordResponse(
                row.Name,
                row.ItemCount,
                row.AverageRating,
                row.NavigationRank))
            .ToList();

        return keywords;
    }

    /// <summary>
    /// Gets count of items in category that have no rank-1 navigation keyword assigned.
    /// This is used for the special "other" keyword.
    /// </summary>
    private static async Task<int> GetOtherItemCountAsync(
        Guid categoryId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string? currentUserId = userContext.UserId;
        bool isAuthenticated = userContext.IsAuthenticated && !string.IsNullOrEmpty(currentUserId);

        // Get all rank-1 keywords for this category
        List<Guid> rank1KeywordIds = await db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId && ck.NavigationRank == 1)
            .Select(ck => ck.KeywordId)
            .ToListAsync(cancellationToken);

        IQueryable<Item> query = db.Items
            .Where(i => i.CategoryId == categoryId);

        // Apply visibility filter
        if (!isAuthenticated || string.IsNullOrEmpty(currentUserId))
        {
            query = query.Where(i => !i.IsPrivate);
        }
        else
        {
            query = query.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == currentUserId));
        }

        // Items that have no rank-1 keyword assigned
        if (rank1KeywordIds.Count > 0)
        {
            query = query.Where(i => !i.ItemKeywords.Any(ik => rank1KeywordIds.Contains(ik.KeywordId)));
        }

        return await query.CountAsync(cancellationToken);
    }

    /// <summary>
    /// Resolves category name to category ID, respecting visibility.
    /// </summary>
    private static async Task<Guid?> ResolveCategoryIdAsync(
        string categoryName,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        // Try global category first
        Category? globalCategory = await db.Categories
            .FirstOrDefaultAsync(c => !c.IsPrivate && c.Name.ToLower() == categoryName.ToLower(), cancellationToken);

        if (globalCategory is not null)
        {
            return globalCategory.Id;
        }

        // Try private category if authenticated
        if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
        {
            Category? privateCategory = await db.Categories
                .FirstOrDefaultAsync(c => c.IsPrivate
                    && c.CreatedBy == userContext.UserId
                    && c.Name.ToLower() == categoryName.ToLower(), cancellationToken);

            if (privateCategory is not null)
            {
                return privateCategory.Id;
            }
        }

        return null;
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature
        }
    }
}
