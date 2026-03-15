using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class GetAvailableKeywordsForCategory
{
    public sealed record KeywordOption(Guid Id, string Name);

    public sealed record Response(List<KeywordOption> Keywords);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/categories/{categoryId:guid}/keywords-available", Handler)
                .WithTags("Admin")
                .WithSummary("List keywords available to add (Admin only)")
                .WithDescription("Returns keywords that are not yet assigned to this category as navigation keywords, excluding \"other\".")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid categoryId,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(categoryId, db, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code == "Admin.CategoryNotFound"
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Guid categoryId,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        bool categoryExists = await db.Categories.AnyAsync(c => c.Id == categoryId, cancellationToken);
        if (!categoryExists)
            return Result.Failure<Response>(Error.NotFound("Admin.CategoryNotFound", "Category not found"));

        List<Guid> assignedKeywordIds = await db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId)
            .Select(ck => ck.KeywordId)
            .ToListAsync(cancellationToken);

        List<KeywordOption> available = await db.Keywords
            .Where(k => k.Name.ToLower() != "other" && !assignedKeywordIds.Contains(k.Id))
            .OrderBy(k => k.Name)
            .Select(k => new KeywordOption(k.Id, k.Name))
            .ToListAsync(cancellationToken);

        return Result.Success(new Response(available));
    }
}
