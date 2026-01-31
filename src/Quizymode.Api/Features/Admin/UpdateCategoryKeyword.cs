using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class UpdateCategoryKeyword
{
    public sealed record Request(
        string? ParentName,
        int? NavigationRank,
        int? SortRank);

    public sealed record Response(
        Guid Id,
        Guid CategoryId,
        Guid KeywordId,
        int? NavigationRank,
        string? ParentName,
        int SortRank);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("admin/category-keywords/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Update category keyword (Admin only)")
                .WithDescription("Updates a CategoryKeyword's parent assignment, navigation rank, or sort rank.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Guid id,
            Request request,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(id, request, db, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code switch
                {
                    "Admin.CategoryKeywordNotFound" => Results.NotFound(),
                    _ => CustomResults.Problem(result)
                });
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Guid id,
        Request request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        CategoryKeyword? ck = await db.CategoryKeywords
            .Include(x => x.Category)
            .Include(x => x.Keyword)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (ck is null)
        {
            return Result.Failure<Response>(
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
                return Result.Failure<Response>(
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

        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new Response(
            ck.Id,
            ck.CategoryId,
            ck.KeywordId,
            ck.NavigationRank,
            ck.ParentName,
            ck.SortRank));
    }
}
