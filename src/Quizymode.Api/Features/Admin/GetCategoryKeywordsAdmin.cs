using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
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
        int SortRank,
        string? Description,
        bool IsPrivate,
        bool IsReviewPending,
        string? CreatedBy);

    public sealed record Response(List<CategoryKeywordAdminResponse> Keywords);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/keywords", Handler)
                .WithTags("Admin")
                .WithSummary("List all keyword relations (Admin only)")
                .WithDescription("Returns KeywordRelation entries (excluding 'other'). Optional filters: category name, navigation rank, pendingOnly (relations awaiting review).")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            string? category,
            int? rank,
            bool? pendingOnly,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(db, category?.Trim(), rank, pendingOnly == true, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        string? categoryName,
        int? navigationRank,
        bool pendingOnly,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<KeywordRelation> query = db.KeywordRelations
                .Include(kr => kr.Category)
                .Include(kr => kr.ChildKeyword)
                .Include(kr => kr.ParentKeyword)
                .Where(kr => kr.ChildKeyword.Name.ToLower() != "other");

            if (!string.IsNullOrWhiteSpace(categoryName))
            {
                string name = categoryName.Trim().ToLower();
                query = query.Where(kr => kr.Category.Name.ToLower() == name);
            }

            if (navigationRank.HasValue)
            {
                int r = navigationRank.Value;
                if (r == 1)
                    query = query.Where(kr => kr.ParentKeywordId == null);
                else if (r == 2)
                    query = query.Where(kr => kr.ParentKeywordId != null);
            }

            if (pendingOnly)
                query = query.Where(kr => kr.IsReviewPending);

            List<CategoryKeywordAdminResponse> list = await query
                .OrderBy(kr => kr.Category.Name)
                .ThenBy(kr => kr.SortOrder)
                .ThenBy(kr => kr.ChildKeyword.Name)
                .Select(kr => new CategoryKeywordAdminResponse(
                    kr.Id,
                    kr.CategoryId,
                    kr.Category.Name,
                    kr.ChildKeywordId,
                    kr.ChildKeyword.Name,
                    kr.ParentKeywordId == null ? 1 : 2,
                    kr.ParentKeyword != null ? kr.ParentKeyword.Name : null,
                    kr.SortOrder,
                    kr.Description,
                    kr.IsPrivate,
                    kr.IsReviewPending,
                    kr.CreatedBy))
                .ToListAsync(cancellationToken);

            return Result.Success(new Response(list));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Admin.GetCategoryKeywordsFailed", $"Failed to get keyword relations: {ex.Message}"));
        }
    }
}
