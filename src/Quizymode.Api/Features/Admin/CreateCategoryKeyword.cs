using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class CreateCategoryKeyword
{
    public sealed record CreateCategoryKeywordRequest(
        Guid CategoryId,
        Guid? ParentKeywordId,
        Guid ChildKeywordId,
        int SortRank = 0,
        string? Description = null);

    public sealed record CreateCategoryKeywordResponse(
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
            app.MapPost("admin/category-keywords", Handler)
                .WithTags("Admin")
                .WithSummary("Create keyword relation (Admin only)")
                .WithDescription("Adds a keyword to navigation for a category. ParentKeywordId null = root (rank 1); otherwise rank 2 under that parent. \"Other\" is not allowed.")
                .RequireAuthorization("Admin")
                .Produces<CreateCategoryKeywordResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            CreateCategoryKeywordRequest request,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<CreateCategoryKeywordResponse> result = await HandleAsync(request, db, cancellationToken);
            return result.Match(
                value => Results.Created($"/admin/category-keywords/{value.Id}", value),
                failure => failure.Error.Code switch
                {
                    "Admin.CategoryNotFound" => Results.NotFound(),
                    "Admin.KeywordNotFound" => Results.NotFound(),
                    "Admin.KeywordOtherNotAllowed" => Results.BadRequest(),
                    "Admin.CategoryKeywordAlreadyExists" => Results.BadRequest(),
                    "Admin.InvalidParent" => Results.BadRequest(),
                    _ => CustomResults.Problem(result)
                });
        }
    }

    public static async Task<Result<CreateCategoryKeywordResponse>> HandleAsync(
        CreateCategoryKeywordRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        Keyword? childKeyword = await db.Keywords.FindAsync([request.ChildKeywordId], cancellationToken);
        if (childKeyword is null)
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.NotFound("Admin.KeywordNotFound", "Keyword not found"));

        if (string.Equals(childKeyword.Name, "other", StringComparison.OrdinalIgnoreCase))
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.Validation("Admin.KeywordOtherNotAllowed", "\"Other\" cannot be added as a navigation keyword."));

        Category? category = await db.Categories.FindAsync([request.CategoryId], cancellationToken);
        if (category is null)
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.NotFound("Admin.CategoryNotFound", "Category not found"));

        bool exists = await db.KeywordRelations.AnyAsync(kr =>
            kr.CategoryId == request.CategoryId &&
            kr.ParentKeywordId == request.ParentKeywordId &&
            kr.ChildKeywordId == request.ChildKeywordId,
            cancellationToken);
        if (exists)
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.Validation("Admin.CategoryKeywordAlreadyExists", "This relation already exists."));

        if (request.ParentKeywordId.HasValue)
        {
            bool validParent = await db.KeywordRelations.AnyAsync(kr =>
                kr.CategoryId == request.CategoryId &&
                kr.ParentKeywordId == null &&
                kr.ChildKeywordId == request.ParentKeywordId.Value,
                cancellationToken);
            if (!validParent)
                return Result.Failure<CreateCategoryKeywordResponse>(
                    Error.Validation("Admin.InvalidParent", "ParentKeywordId must be a root (rank-1) keyword for this category."));
        }

        var kr = new KeywordRelation
        {
            Id = Guid.NewGuid(),
            CategoryId = request.CategoryId,
            ParentKeywordId = request.ParentKeywordId,
            ChildKeywordId = request.ChildKeywordId,
            SortOrder = request.SortRank,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            IsPrivate = false,
            CreatedBy = null,
            IsReviewPending = false,
            CreatedAt = DateTime.UtcNow
        };
        db.KeywordRelations.Add(kr);
        await db.SaveChangesAsync(cancellationToken);

        string? parentName = null;
        if (request.ParentKeywordId.HasValue)
        {
            Keyword? parent = await db.Keywords.FindAsync([request.ParentKeywordId.Value], cancellationToken);
            parentName = parent?.Name;
        }

        return Result.Success(new CreateCategoryKeywordResponse(
            kr.Id,
            kr.CategoryId,
            kr.ChildKeywordId,
            kr.ParentKeywordId == null ? 1 : 2,
            parentName,
            kr.SortOrder,
            kr.Description));
    }
}
