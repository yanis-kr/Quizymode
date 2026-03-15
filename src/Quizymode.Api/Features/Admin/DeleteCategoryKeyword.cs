using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class DeleteCategoryKeyword
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("admin/category-keywords/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Delete category keyword (Admin only)")
                .WithDescription("Removes a keyword from navigation for a category. The keyword entity remains; only the navigation assignment is removed.")
                .RequireAuthorization("Admin")
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result result = await HandleAsync(id, db, cancellationToken);
            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Code == "Admin.CategoryKeywordNotFound"
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result> HandleAsync(
        Guid id,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        CategoryKeyword? ck = await db.CategoryKeywords.FindAsync([id], cancellationToken);
        if (ck is null)
            return Result.Failure(Error.NotFound("Admin.CategoryKeywordNotFound", $"CategoryKeyword {id} not found"));

        db.CategoryKeywords.Remove(ck);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
