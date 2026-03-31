using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class DeleteCategory
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("admin/categories/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Delete category (Admin only)")
                .WithDescription("Deletes a category only when it has no items. KeywordRelations for this category are removed.")
                .RequireAuthorization("Admin")
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result result = await HandleAsync(id, db, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : failure.Error.Type == ErrorType.Conflict
                        ? Results.Conflict(failure.Error.Description)
                        : CustomResults.Problem(result));
        }
    }

    public static async Task<Result> HandleAsync(
        Guid id,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        Category? category = await db.Categories.FindAsync([id], cancellationToken);
        if (category is null)
        {
            return Result.Failure(
                Error.NotFound("Admin.CategoryNotFound", $"Category {id} not found"));
        }

        int itemCount = await db.Items
            .CountAsync(i => i.CategoryId == id, cancellationToken);
        if (itemCount > 0)
        {
            return Result.Failure(
                Error.Conflict("Admin.CategoryHasItems", $"Cannot delete category: it has {itemCount} item(s). Remove or reassign items first."));
        }

        List<KeywordRelation> relations = await db.KeywordRelations
            .Where(kr => kr.CategoryId == id)
            .ToListAsync(cancellationToken);
        db.KeywordRelations.RemoveRange(relations);
        db.Categories.Remove(category);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed
        }
    }
}
