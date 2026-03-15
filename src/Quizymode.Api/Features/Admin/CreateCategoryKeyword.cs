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
        Guid KeywordId,
        int NavigationRank,
        string? ParentName,
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
                .WithSummary("Create category keyword (Admin only)")
                .WithDescription("Adds a keyword to navigation for a category. Rank 1 = top-level, Rank 2 = under a parent. \"Other\" is not allowed.")
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
                    _ => CustomResults.Problem(result)
                });
        }
    }

    public static async Task<Result<CreateCategoryKeywordResponse>> HandleAsync(
        CreateCategoryKeywordRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        Keyword? keyword = await db.Keywords.FindAsync([request.KeywordId], cancellationToken);
        if (keyword is null)
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.NotFound("Admin.KeywordNotFound", "Keyword not found"));

        if (string.Equals(keyword.Name, "other", StringComparison.OrdinalIgnoreCase))
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.Validation("Admin.KeywordOtherNotAllowed", "\"Other\" cannot be added as a navigation keyword."));

        Category? category = await db.Categories.FindAsync([request.CategoryId], cancellationToken);
        if (category is null)
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.NotFound("Admin.CategoryNotFound", "Category not found"));

        bool exists = await db.CategoryKeywords
            .AnyAsync(ck => ck.CategoryId == request.CategoryId && ck.KeywordId == request.KeywordId, cancellationToken);
        if (exists)
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.Validation("Admin.CategoryKeywordAlreadyExists", "This keyword is already assigned to this category."));

        if (request.NavigationRank != 1 && request.NavigationRank != 2)
            return Result.Failure<CreateCategoryKeywordResponse>(
                Error.Validation("Admin.InvalidNavigationRank", "NavigationRank must be 1 or 2."));

        string? parentName = null;
        if (request.NavigationRank == 2)
        {
            if (string.IsNullOrWhiteSpace(request.ParentName))
                return Result.Failure<CreateCategoryKeywordResponse>(
                    Error.Validation("Admin.ParentRequired", "Parent name is required for rank 2."));
            parentName = request.ParentName.Trim();
        }

        var ck = new CategoryKeyword
        {
            CategoryId = request.CategoryId,
            KeywordId = request.KeywordId,
            NavigationRank = request.NavigationRank,
            ParentName = parentName,
            SortRank = request.SortRank,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
        };
        db.CategoryKeywords.Add(ck);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new CreateCategoryKeywordResponse(
            ck.Id,
            ck.CategoryId,
            ck.KeywordId,
            ck.NavigationRank,
            ck.ParentName,
            ck.SortRank,
            ck.Description));
    }
}
