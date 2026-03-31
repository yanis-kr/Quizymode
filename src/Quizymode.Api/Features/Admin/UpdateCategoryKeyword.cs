using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class UpdateCategoryKeyword
{
    public sealed record UpdateCategoryKeywordRequest(
        Guid? ParentKeywordId,
        int? SortRank,
        string? Description = null,
        bool? Approve = null);

    public sealed record UpdateCategoryKeywordResponse(
        Guid Id,
        Guid CategoryId,
        Guid KeywordId,
        int? NavigationRank,
        string? ParentName,
        int SortRank,
        string? Description,
        bool IsPrivate,
        bool IsReviewPending);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("admin/category-keywords/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Update keyword relation (Admin only)")
                .WithDescription("Updates a KeywordRelation's parent, sort order, or description. Set Approve=true to make the relation public (IsPrivate=false, IsReviewPending=false).")
                .RequireAuthorization("Admin")
                .Produces<UpdateCategoryKeywordResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Guid id,
            UpdateCategoryKeywordRequest request,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<UpdateCategoryKeywordResponse> result = await HandleAsync(id, request, db, userContext, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code switch
                {
                    "Admin.CategoryKeywordNotFound" => Results.NotFound(),
                    "Admin.InvalidParent" => Results.BadRequest(),
                    _ => CustomResults.Problem(result)
                });
        }
    }

    public static async Task<Result<UpdateCategoryKeywordResponse>> HandleAsync(
        Guid id,
        UpdateCategoryKeywordRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        KeywordRelation? kr = await db.KeywordRelations
            .Include(x => x.Category)
            .Include(x => x.ChildKeyword)
            .Include(x => x.ParentKeyword)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (kr is null)
            return Result.Failure<UpdateCategoryKeywordResponse>(
                Error.NotFound("Admin.CategoryKeywordNotFound", $"KeywordRelation {id} not found"));

        if (request.ParentKeywordId.HasValue)
        {
            bool validParent = await db.KeywordRelations.AnyAsync(k =>
                k.CategoryId == kr.CategoryId &&
                k.ParentKeywordId == null &&
                k.ChildKeywordId == request.ParentKeywordId.Value,
                cancellationToken);
            if (!validParent)
                return Result.Failure<UpdateCategoryKeywordResponse>(
                    Error.Validation("Admin.InvalidParent", "ParentKeywordId must be a root (rank-1) keyword for this category."));
            kr.ParentKeywordId = request.ParentKeywordId;
        }

        if (request.SortRank.HasValue)
            kr.SortOrder = request.SortRank.Value;

        if (request.Description is not null)
            kr.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        if (request.Approve == true)
        {
            kr.IsPrivate = false;
            kr.IsReviewPending = false;
            kr.ReviewedAt = DateTime.UtcNow;
            kr.ReviewedBy = userContext.UserId ?? "admin";
        }

        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new UpdateCategoryKeywordResponse(
            kr.Id,
            kr.CategoryId,
            kr.ChildKeywordId,
            kr.ParentKeywordId == null ? 1 : 2,
            kr.ParentKeyword?.Name,
            kr.SortOrder,
            kr.Description,
            kr.IsPrivate,
            kr.IsReviewPending));
    }
}
