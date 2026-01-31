using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class UpdateCategoryKeyword
{
    public sealed record UpdateCategoryKeywordRequest(
        string? ParentName,
        int? NavigationRank,
        int? SortRank,
        string? Description = null);

    public sealed record UpdateCategoryKeywordResponse(
        Guid Id,
        Guid CategoryId,
        Guid KeywordId,
        int? NavigationRank,
        string? ParentName,
        int SortRank,
        string? Description);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("admin/category-keywords/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Update category keyword (Admin only)")
                .WithDescription("Updates a CategoryKeyword's parent, navigation rank, sort rank, or description.")
                .RequireAuthorization("Admin")
                .Produces<UpdateCategoryKeywordResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Guid id,
            UpdateCategoryKeywordRequest request,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<UpdateCategoryKeywordResponse> result = await HandleAsync(id, request, db, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code switch
                {
                    "Admin.CategoryKeywordNotFound" => Results.NotFound(),
                    _ => CustomResults.Problem(result)
                });
        }
    }

    public static async Task<Result<UpdateCategoryKeywordResponse>> HandleAsync(
        Guid id,
        UpdateCategoryKeywordRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        CategoryKeyword? ck = await db.CategoryKeywords
            .Include(x => x.Category)
            .Include(x => x.Keyword)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (ck is null)
        {
            return Result.Failure<UpdateCategoryKeywordResponse>(
                Error.NotFound("Admin.CategoryKeywordNotFound", $"CategoryKeyword {id} not found"));
        }

        if (request.ParentName is not null)
        {
            string normalized = request.ParentName.Trim();
            ck.ParentName = string.IsNullOrEmpty(normalized) ? null : normalized.ToLowerInvariant();
        }

        if (request.NavigationRank.HasValue)
        {
            int rank = request.NavigationRank.Value;
            if (rank != 1 && rank != 2)
            {
                return Result.Failure<UpdateCategoryKeywordResponse>(
                    Error.Validation("Admin.InvalidNavigationRank", "NavigationRank must be 1 or 2"));
            }
            ck.NavigationRank = rank;
            if (rank == 1)
                ck.ParentName = null;
        }

        if (request.SortRank.HasValue)
        {
            ck.SortRank = request.SortRank.Value;
        }

        if (request.Description is not null)
        {
            ck.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        }

        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new UpdateCategoryKeywordResponse(
            ck.Id,
            ck.CategoryId,
            ck.KeywordId,
            ck.NavigationRank,
            ck.ParentName,
            ck.SortRank,
            ck.Description));
    }
}
