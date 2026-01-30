using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class GetCategoryKeywordsAdmin
{
    public sealed record CategoryKeywordAdminResponse(
        Guid Id,
        Guid CategoryId,
        string CategoryName,
        Guid KeywordId,
        string KeywordName,
        int? NavigationRank,
        string? ParentName,
        int SortRank);

    public sealed record Response(List<CategoryKeywordAdminResponse> Keywords);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/keywords", Handler)
                .WithTags("Admin")
                .WithSummary("List all category keywords (Admin only)")
                .WithDescription("Returns CategoryKeyword entries (excluding 'other'). Optional filters: category name, navigation rank.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            string? category,
            int? rank,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(db, category?.Trim(), rank, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        string? categoryName,
        int? navigationRank,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<CategoryKeyword> query = db.CategoryKeywords
                .Include(ck => ck.Category)
                .Include(ck => ck.Keyword)
                .Where(ck => ck.Keyword.Name.ToLower() != "other");

            if (!string.IsNullOrWhiteSpace(categoryName))
            {
                string name = categoryName.Trim().ToLower();
                query = query.Where(ck => ck.Category.Name.ToLower() == name);
            }

            if (navigationRank.HasValue)
            {
                int r = navigationRank.Value;
                query = query.Where(ck => ck.NavigationRank == r);
            }

            List<CategoryKeywordAdminResponse> list = await query
                .OrderBy(ck => ck.Category.Name)
                .ThenBy(ck => ck.SortRank)
                .ThenBy(ck => ck.Keyword.Name)
                .Select(ck => new CategoryKeywordAdminResponse(
                    ck.Id,
                    ck.CategoryId,
                    ck.Category.Name,
                    ck.KeywordId,
                    ck.Keyword.Name,
                    ck.NavigationRank,
                    ck.ParentName,
                    ck.SortRank))
                .ToListAsync(cancellationToken);

            return Result.Success(new Response(list));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Admin.GetCategoryKeywordsFailed", $"Failed to get category keywords: {ex.Message}"));
        }
    }
}
